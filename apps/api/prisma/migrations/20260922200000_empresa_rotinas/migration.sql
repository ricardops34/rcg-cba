-- Liga/desliga de rotina por empresa — o terceiro nível, irmão de
-- `empresa_modulos` e `empresa_menus` (20260922140000_empresa_modulos_menus).
--
-- O model `EmpresaRotina` já estava no schema e o `EstruturaService` já
-- consultava `tx.empresaRotina`, mas a tabela não existia: sem ela, `GET
-- /modulos` falha e **o menu lateral inteiro para de carregar**, porque é dali
-- que a barra nasce.
--
-- Mesma regra das irmãs: ausência de linha = ligada, só a exceção é gravada.
-- Tem `empresaId`, logo tem RLS (ver prisma/migrations/README.md).

CREATE TABLE IF NOT EXISTS "empresa_rotinas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rotinaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "empresa_rotinas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "empresa_rotinas_empresaId_rotinaId_key"
  ON "empresa_rotinas"("empresaId", "rotinaId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_rotinas_empresaId_fkey') THEN
    ALTER TABLE "empresa_rotinas" ADD CONSTRAINT "empresa_rotinas_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresa_rotinas_rotinaId_fkey') THEN
    ALTER TABLE "empresa_rotinas" ADD CONSTRAINT "empresa_rotinas_rotinaId_fkey"
      FOREIGN KEY ("rotinaId") REFERENCES "rotinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "empresa_rotinas" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
DROP POLICY IF EXISTS tenant_isolation_empresa_rotinas ON "empresa_rotinas";
CREATE POLICY tenant_isolation_empresa_rotinas ON "empresa_rotinas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
