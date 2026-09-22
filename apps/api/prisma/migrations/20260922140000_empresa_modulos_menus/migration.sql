-- Liga/desliga de módulo e de menu **por empresa**.
--
-- O catálogo (modulos/menus/rotinas) é global e continua sendo: o `ativo` de lá
-- vale para todos os clientes e só o administrador da plataforma mexe. Estas
-- tabelas são o outro lado — o administrador de uma empresa decide o que a
-- empresa dele usa, sem afetar ninguém.
--
-- Ausência de linha = ligado. Só a exceção é gravada, então empresa nova e
-- módulo novo já nascem disponíveis, sem carga inicial.

CREATE TABLE "empresa_modulos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "empresa_modulos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "empresa_menus" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "empresa_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "empresa_modulos_empresaId_moduloId_key" ON "empresa_modulos"("empresaId", "moduloId");
CREATE UNIQUE INDEX "empresa_menus_empresaId_menuId_key" ON "empresa_menus"("empresaId", "menuId");

ALTER TABLE "empresa_modulos" ADD CONSTRAINT "empresa_modulos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_modulos" ADD CONSTRAINT "empresa_modulos_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_menus" ADD CONSTRAINT "empresa_menus_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_menus" ADD CONSTRAINT "empresa_menus_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "empresa_modulos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "empresa_menus" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_empresa_modulos ON "empresa_modulos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_empresa_menus ON "empresa_menus"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
