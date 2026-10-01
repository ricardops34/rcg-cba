-- Logo impresso no DANFE, separado do logo do sistema (pedido do usuário,
-- 01/10/2026). Sem ele, o DANFE usa o logoUrl.
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "logoDanfeUrl" TEXT;
