-- Horário de atendimento, fuso e feriados — da **empresa**, não do usuário.
--
-- Até aqui o fuso era uma constante no código (`America/Campo_Grande`) e o
-- "expediente" saía dos horários de cada usuário. Funcionava porque havia uma
-- empresa só. Com várias, "18:00" não é o mesmo instante em Campo Grande e em
-- Belém, e o atendimento fecharia na hora errada para quem estivesse fora do
-- fuso do servidor.
--
-- E o horário de uma pessoa não é o da empresa: `usuario_horarios` existe para
-- barrar login fora de hora, o que é outra pergunta. Confundir os dois faz o
-- WhatsApp institucional responder "estamos fechados" porque o vendedor tem
-- expediente reduzido.

ALTER TABLE "empresas"
  ADD COLUMN "fusoHorario" TEXT NOT NULL DEFAULT 'America/Campo_Grande';

CREATE TABLE "empresa_horarios_atendimento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "empresa_horarios_atendimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "empresa_horarios_atendimento_empresaId_diaSemana_horaInicio_key"
  ON "empresa_horarios_atendimento"("empresaId", "diaSemana", "horaInicio");
CREATE INDEX "empresa_horarios_atendimento_empresaId_diaSemana_idx"
  ON "empresa_horarios_atendimento"("empresaId", "diaSemana");

ALTER TABLE "empresa_horarios_atendimento"
  ADD CONSTRAINT "empresa_horarios_atendimento_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "OrigemFeriado" AS ENUM ('nacional_fixo', 'nacional_movel', 'manual');

-- Data cheia, e não dia/mês, mesmo para os fixos: feriado móvel (Carnaval,
-- Sexta-feira Santa, Corpus Christi) não tem dia fixo, e dois formatos na
-- mesma tabela obrigariam toda consulta a tratar os dois casos.
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nome" TEXT NOT NULL,
    "origem" "OrigemFeriado" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feriados_empresaId_data_key" ON "feriados"("empresaId", "data");
CREATE INDEX "feriados_empresaId_data_idx" ON "feriados"("empresaId", "data");

ALTER TABLE "feriados"
  ADD CONSTRAINT "feriados_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security: as duas são tabelas de negócio com empresaId (ver o
-- README deste diretório).
ALTER TABLE "empresa_horarios_atendimento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_empresa_horarios_atendimento
  ON "empresa_horarios_atendimento"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "feriados" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_feriados ON "feriados"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "empresa_horarios_atendimento" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "feriados" TO plataforma_app;

-- Horário comercial clássico para quem já existe, para o atendimento não
-- nascer sem expediente nenhum (o que faria a triagem dizer "estamos fechados"
-- em toda mensagem). Segunda a sexta, 08:00–18:00.
INSERT INTO "empresa_horarios_atendimento"
  ("id", "empresaId", "diaSemana", "horaInicio", "horaFim", "createdAt", "updatedAt")
SELECT gen_random_uuid(), e."id", d."dia", '08:00', '18:00', now(), now()
FROM "empresas" e
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d("dia")
WHERE e."deletedAt" IS NULL;
