-- "Calcular" em lote da Sugestão de Compra em segundo plano.
--
-- O lote recalcula cliente a cliente sobre a base inteira e podia prender a
-- requisição por até 15 minutos. Agora o POST registra uma execução, responde
-- na hora e o cálculo corre em segundo plano; a tela acompanha por aqui.

CREATE TYPE "SituacaoExecucaoSugestao" AS ENUM ('rodando', 'concluida', 'falhou');

CREATE TABLE "sugestao_compra_execucoes" (
  "id"          TEXT NOT NULL,
  "empresaId"   TEXT NOT NULL,
  "usuarioId"   TEXT NOT NULL,
  "situacao"    "SituacaoExecucaoSugestao" NOT NULL DEFAULT 'rodando',
  "parametros"  JSONB,
  "resultado"   JSONB,
  "erro"        TEXT,
  "iniciadaEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidaEm" TIMESTAMP(3),
  CONSTRAINT "sugestao_compra_execucoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sugestao_compra_execucoes_empresaId_fkey" FOREIGN KEY ("empresaId")
    REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sugestao_compra_execucoes_empresaId_iniciadaEm_idx"
  ON "sugestao_compra_execucoes"("empresaId", "iniciadaEm");

-- Uma execução em andamento por empresa: duas ao mesmo tempo gravariam uma
-- por cima da outra. Índice parcial (o Prisma não representa) — a trava é o
-- banco, não a tela.
CREATE UNIQUE INDEX "sugestao_compra_execucoes_uma_rodando"
  ON "sugestao_compra_execucoes"("empresaId") WHERE "situacao" = 'rodando';

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "sugestao_compra_execucoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sugestao_compra_execucoes ON "sugestao_compra_execucoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Aviso no sino para quem pediu, quando o cálculo termina.
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'sugestao_compra_calculada';
