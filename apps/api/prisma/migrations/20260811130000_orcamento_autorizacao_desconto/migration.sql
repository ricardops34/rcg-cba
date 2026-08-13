-- Autorização de desconto do orçamento, em duas etapas.
--
-- Item com desconto igual ou acima do "% Desc Máximo" da regra trava a
-- proposta em PDF e a efetivação (status aprovado) até alguém com permissão de
-- aprovar autorizar. O vendedor solicita (descontoSolicitadoEm/Por, que gera
-- uma Atividade de pendência para o supervisor) e o autorizador libera
-- (descontoAutorizadoEm/Por).
--
-- Só colunas novas numa tabela que já tem RLS por empresaId — a policy
-- existente continua valendo, não há policy nova a criar.

ALTER TABLE "orcamentos"
  ADD COLUMN IF NOT EXISTS "descontoSolicitadoEm"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "descontoSolicitadoPor" TEXT,
  ADD COLUMN IF NOT EXISTS "descontoAutorizadoEm"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "descontoAutorizadoPor" TEXT;
