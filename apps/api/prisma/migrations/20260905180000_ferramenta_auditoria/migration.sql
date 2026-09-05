-- Trilha das alterações no cadastro de ferramentas do agente.
--
-- O comportamento do assistente virou campo editável pela empresa
-- (`instrucoes`, migration 20260905160000). Sem registro, "o assistente começou
-- a responder diferente" seria impossível de investigar: ninguém saberia se
-- alguém reescreveu o prompt, quando, nem o que estava lá antes.
--
-- Guarda o **antes e o depois**. O valor anterior é o que permite desfazer e o
-- que explica a mudança de comportamento.

CREATE TABLE "agente_ferramenta_auditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "autorId" TEXT,
    "autorEmail" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_ferramenta_auditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agente_ferramenta_auditoria_empresaId_chave_criadoEm_idx" ON "agente_ferramenta_auditoria"("empresaId", "chave", "criadoEm");
CREATE INDEX "agente_ferramenta_auditoria_empresaId_criadoEm_idx" ON "agente_ferramenta_auditoria"("empresaId", "criadoEm");

ALTER TABLE "agente_ferramenta_auditoria" ADD CONSTRAINT "agente_ferramenta_auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "agente_ferramenta_auditoria" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_agente_ferramenta_auditoria ON "agente_ferramenta_auditoria"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Aceite dos termos para editar o comportamento das ferramentas.
--
-- Reescrever o prompt muda como o assistente fala com cliente e equipe, e o
-- efeito não aparece numa tela — aparece numa conversa, depois. O aceite é o
-- momento em que alguém assume isso por escrito.
--
-- Nulo = ninguém aceitou, e a API recusa a edição dos textos. Ligar/desligar
-- uma ferramenta segue liberado: aquilo é configuração, não redação.
ALTER TABLE "agente_config"
  ADD COLUMN "termosPromptAceitosEm" TIMESTAMP(3),
  ADD COLUMN "termosPromptAceitosPor" TEXT;
