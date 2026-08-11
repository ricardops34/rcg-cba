-- Parâmetros do sistema por empresa (Administração > Parâmetros), no formato
-- clássico de tabela de parâmetros de ERP: uma linha por parâmetro, com tipo,
-- tamanho, conteúdo e descrição. Centraliza o que antes ficava espalhado em
-- telas próprias.
--
-- O primeiro parâmetro migrado é o "dias de validade do orçamento", que sai de
-- orcamento_config — lá fica apenas o contador da numeração, que é estado
-- interno e não parâmetro de usuário.

-- CreateEnum
CREATE TYPE "TipoParametro" AS ENUM ('texto', 'numero', 'booleano', 'data', 'senha');

-- CreateTable
CREATE TABLE "parametros_empresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "parametro" TEXT NOT NULL,
    "tipo" "TipoParametro" NOT NULL DEFAULT 'texto',
    "tamanho" INTEGER,
    "conteudo" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "parametros_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parametros_empresa_empresaId_parametro_idx" ON "parametros_empresa"("empresaId", "parametro");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_empresa_empresaId_parametro_key" ON "parametros_empresa"("empresaId", "parametro");

-- AddForeignKey
ALTER TABLE "parametros_empresa" ADD CONSTRAINT "parametros_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "parametros_empresa" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_parametros_empresa ON "parametros_empresa"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Semeia os parâmetros conhecidos em cada empresa. O de validade preserva o
-- valor que a empresa já tinha em Validade de Orçamento.
INSERT INTO "parametros_empresa" ("id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  e."id",
  d."parametro",
  d."tipo"::"TipoParametro",
  d."tamanho",
  CASE
    WHEN d."parametro" = 'ORCAMENTO_DIAS_VALIDADE'
      THEN COALESCE((SELECT oc."diasValidade"::text FROM "orcamento_config" oc WHERE oc."empresaId" = e."id"), d."conteudo")
    ELSE d."conteudo"
  END,
  d."descricao",
  now(),
  now()
FROM "empresas" e
CROSS JOIN (VALUES
  ('ORCAMENTO_DIAS_VALIDADE', 'numero',   3,   '30',    'Dias somados à emissão para sugerir a validade do orçamento'),
  ('DESCONTO_ACIMA_LIMITE_BLOQUEIA', 'booleano', NULL, 'false', 'Recusa a gravação do orçamento com desconto acima do limite da regra; falso apenas avisa na tela'),
  ('COMISSAO_OCULTA_PARA_TODOS', 'booleano', NULL, 'false', 'Esconde os valores de comissão de todos os perfis, ignorando a permissão comissao.visualizar'),
  ('SMTP_HOST',      'texto',    120, NULL,    'Servidor de e-mail; vazio usa a configuração do servidor'),
  ('SMTP_PORTA',     'numero',   5,   NULL,    'Porta do servidor de e-mail (ex.: 587)'),
  ('SMTP_SEGURO',    'booleano', NULL,'false', 'Conexão SSL/TLS direta com o servidor de e-mail'),
  ('SMTP_USUARIO',   'texto',    120, NULL,    'Usuário de autenticação no servidor de e-mail'),
  ('SMTP_SENHA',     'senha',    120, NULL,    'Senha de autenticação no servidor de e-mail'),
  ('SMTP_REMETENTE', 'texto',    150, NULL,    'Endereço exibido como remetente dos e-mails')
) AS d("parametro", "tipo", "tamanho", "conteudo", "descricao")
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- AlterTable: o parâmetro migrou; orcamento_config fica só com o contador.
ALTER TABLE "orcamento_config" DROP COLUMN "diasValidade";

-- Menu e rotina da tela nova, no módulo Administração.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-parametros',
  'seed-modulo-administracao',
  'Parâmetros',
  'sliders-horizontal',
  '/admin/parametros',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-parametros',
  'seed-menu-parametros',
  'Parâmetros',
  'parametros',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-parametros-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-parametros',
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN (
  SELECT unnest(ARRAY[
    'visualizar', 'cadastrar', 'editar', 'excluir',
    'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear'
  ]) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- "Validade de Orçamento" sai do menu: seu único parâmetro agora mora aqui.
-- A rotina 'orcamento-config' permanece, para não perder as permissões já
-- configuradas nos perfis.
UPDATE "menus" SET "ativo" = false, "updatedAt" = now()
WHERE "id" = 'seed-menu-orcamento-config';
