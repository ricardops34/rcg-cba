-- Planos, assinatura por empresa e acesso de suporte.
--
-- Os models já estavam no `schema.prisma` e o código já os usava — inclusive o
-- `EstruturaService.desativadosDaEmpresa`, que lê a assinatura junto com o
-- liga/desliga do menu. Sem as tabelas, **`GET /modulos` respondia 500 e a
-- barra lateral inteira parava de carregar** (`The table public.assinaturas
-- does not exist`). Mesmo padrão do 500 da integração de produtos
-- (20260922190000_produto_fabricante) e do login
-- (20260922210000_perfil_plataforma_role): schema e código à frente do banco.
--
-- Esta migration é o DDL que o `prisma migrate diff` gerou a partir do schema,
-- mais a RLS que a regra da casa exige. **Não** inclui os DROPs que o diff
-- sugeriu (índice vetorial de `produto_ficha_trechos`, índices e FKs de
-- WhatsApp): aquilo é drift no sentido contrário — coisa que existe no banco e
-- o schema não declara — e apagar seria perder o que está em uso.

CREATE TYPE "SituacaoAssinatura" AS ENUM ('ativa', 'teste', 'atrasada', 'suspensa', 'cancelada');
CREATE TYPE "CicloPagamento" AS ENUM ('mensal', 'trimestral', 'semestral', 'anual');

-- Catálogo de planos: global, como módulos e menus — não tem `empresaId` e por
-- isso não entra na RLS.
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "valorMensal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorTrimestral" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorSemestral" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorAnual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "limiteUsuarios" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plano_modulos" (
    "planoId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,

    CONSTRAINT "plano_modulos_pkey" PRIMARY KEY ("planoId","moduloId")
);

CREATE TABLE "plano_menus" (
    "planoId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,

    CONSTRAINT "plano_menus_pkey" PRIMARY KEY ("planoId","menuId")
);

CREATE TABLE "plano_rotinas" (
    "planoId" TEXT NOT NULL,
    "rotinaId" TEXT NOT NULL,

    CONSTRAINT "plano_rotinas_pkey" PRIMARY KEY ("planoId","rotinaId")
);

CREATE TABLE "empresa_suporte_acessos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "concedidoPorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "validoAte" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresa_suporte_acessos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "empresa_suporte_logs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "suporteAcessoId" TEXT NOT NULL,
    "usuarioPlataformaId" TEXT NOT NULL,
    "metodoHttp" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "payload" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_suporte_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "situacao" "SituacaoAssinatura" NOT NULL DEFAULT 'ativa',
    "ciclo" "CicloPagamento" NOT NULL DEFAULT 'mensal',
    "valorMensalidade" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proximoVencimentoEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planos_codigo_key" ON "planos"("codigo");
CREATE INDEX "empresa_suporte_acessos_empresaId_validoAte_revogadoEm_idx" ON "empresa_suporte_acessos"("empresaId", "validoAte", "revogadoEm");
CREATE INDEX "empresa_suporte_logs_empresaId_createdAt_idx" ON "empresa_suporte_logs"("empresaId", "createdAt");
CREATE UNIQUE INDEX "assinaturas_empresaId_key" ON "assinaturas"("empresaId");

ALTER TABLE "plano_modulos" ADD CONSTRAINT "plano_modulos_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plano_modulos" ADD CONSTRAINT "plano_modulos_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plano_menus" ADD CONSTRAINT "plano_menus_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plano_menus" ADD CONSTRAINT "plano_menus_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plano_rotinas" ADD CONSTRAINT "plano_rotinas_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plano_rotinas" ADD CONSTRAINT "plano_rotinas_rotinaId_fkey" FOREIGN KEY ("rotinaId") REFERENCES "rotinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_acessos" ADD CONSTRAINT "empresa_suporte_acessos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_acessos" ADD CONSTRAINT "empresa_suporte_acessos_concedidoPorId_fkey" FOREIGN KEY ("concedidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_acessos" ADD CONSTRAINT "empresa_suporte_acessos_revogadoPorId_fkey" FOREIGN KEY ("revogadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_logs" ADD CONSTRAINT "empresa_suporte_logs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_logs" ADD CONSTRAINT "empresa_suporte_logs_suporteAcessoId_fkey" FOREIGN KEY ("suporteAcessoId") REFERENCES "empresa_suporte_acessos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "empresa_suporte_logs" ADD CONSTRAINT "empresa_suporte_logs_usuarioPlataformaId_fkey" FOREIGN KEY ("usuarioPlataformaId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
--
-- ATENÇÃO para quem está construindo a área de Planos: a policy abaixo recorta
-- pelo `app.current_empresa_id`, então toda leitura precisa passar por
-- `withTenant(empresaId, ...)` — é o caso do `EstruturaService`, que lê a
-- assinatura da empresa ativa. Uma tela da plataforma que precise listar as
-- assinaturas de **todas** as empresas não enxergará nada por aqui: esse caso
-- pede uma segunda policy (o precedente é `self_usuario_empresas`, em
-- prisma/migrations/README.md) ou a leitura empresa a empresa.
ALTER TABLE "assinaturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "empresa_suporte_acessos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "empresa_suporte_logs" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_assinaturas ON "assinaturas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_empresa_suporte_acessos ON "empresa_suporte_acessos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_empresa_suporte_logs ON "empresa_suporte_logs"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
