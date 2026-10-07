-- Atualização em lote do cadastro de clientes pela Receita Federal (CNAE e
-- demais dados), em segundo plano.
--
-- Uma consulta por CNPJ, a ~1/s por cortesia com o serviço público: com a
-- carteira ativa inteira, passa de 15 minutos. O POST registra uma execução,
-- responde na hora e o lote corre depois; a tela acompanha o andamento por aqui.

CREATE TYPE "SituacaoExecucaoReceita" AS ENUM ('rodando', 'concluida', 'falhou');

CREATE TABLE "clientes_receita_execucoes" (
  "id"          TEXT NOT NULL,
  "empresaId"   TEXT NOT NULL,
  "usuarioId"   TEXT NOT NULL,
  "situacao"    "SituacaoExecucaoReceita" NOT NULL DEFAULT 'rodando',
  "parametros"  JSONB,
  "resultado"   JSONB,
  "erro"        TEXT,
  "iniciadaEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidaEm" TIMESTAMP(3),
  CONSTRAINT "clientes_receita_execucoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clientes_receita_execucoes_empresaId_fkey" FOREIGN KEY ("empresaId")
    REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "clientes_receita_execucoes_empresaId_iniciadaEm_idx"
  ON "clientes_receita_execucoes"("empresaId", "iniciadaEm");

-- Uma execução em andamento por empresa: duas ao mesmo tempo dobrariam as
-- consultas ao serviço público e disputariam a mesma solicitação pendente de
-- cada cliente. Índice parcial (o Prisma não representa) — a trava é o banco.
CREATE UNIQUE INDEX "clientes_receita_execucoes_uma_rodando"
  ON "clientes_receita_execucoes"("empresaId") WHERE "situacao" = 'rodando';

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "clientes_receita_execucoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_clientes_receita_execucoes ON "clientes_receita_execucoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Aviso no sino para quem pediu, quando o lote termina.
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'clientes_receita_atualizados';
