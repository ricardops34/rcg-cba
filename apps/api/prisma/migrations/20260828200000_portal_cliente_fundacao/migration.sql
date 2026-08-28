ALTER TYPE "OrigemAlteracaoCliente" ADD VALUE IF NOT EXISTS 'portal_cliente';

CREATE TABLE "cliente_contatos" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "clienteId" TEXT NOT NULL,
  "perfilId" TEXT, "nome" TEXT NOT NULL, "email" TEXT NOT NULL,
  "telefone" TEXT, "celular" TEXT, "cargo" TEXT,
  "principal" BOOLEAN NOT NULL DEFAULT false, "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "createdBy" TEXT, "updatedBy" TEXT,
  CONSTRAINT "cliente_contatos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_configs" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "ativo" BOOLEAN NOT NULL DEFAULT false,
  "permitirAtualizarCadastro" BOOLEAN NOT NULL DEFAULT false,
  "permitirManterContatos" BOOLEAN NOT NULL DEFAULT false,
  "exibirDesconto" BOOLEAN NOT NULL DEFAULT false,
  "permitirSolicitarDesconto" BOOLEAN NOT NULL DEFAULT false,
  "descontoMaximoSolicitavel" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exibirEstoque" BOOLEAN NOT NULL DEFAULT false,
  "permitirProdutoForaMix" BOOLEAN NOT NULL DEFAULT true,
  "diasValidadeCarrinho" INTEGER NOT NULL DEFAULT 7,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "updatedBy" TEXT,
  CONSTRAINT "portal_cliente_configs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_perfis" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "nome" TEXT NOT NULL,
  "descricao" TEXT, "sistemaBase" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "createdBy" TEXT, "updatedBy" TEXT,
  CONSTRAINT "portal_cliente_perfis_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_rotinas" (
  "id" TEXT NOT NULL, "codigo" TEXT NOT NULL, "nome" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0, "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "portal_cliente_rotinas_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_perfil_permissoes" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "perfilId" TEXT NOT NULL,
  "rotinaId" TEXT NOT NULL, "acao" TEXT NOT NULL,
  "permitido" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "portal_cliente_perfil_permissoes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_habilitacoes" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "clienteId" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "updatedBy" TEXT,
  CONSTRAINT "portal_cliente_habilitacoes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_credenciais" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "contatoId" TEXT NOT NULL,
  "empresaAlias" TEXT NOT NULL, "emailNormalizado" TEXT NOT NULL,
  "senhaHash" TEXT NOT NULL, "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
  "bloqueadoAte" TIMESTAMP(3), "ultimoLogin" TIMESTAMP(3),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portal_cliente_credenciais_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_sessoes" (
  "id" TEXT NOT NULL, "credencialId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revogadoEm" TIMESTAMP(3),
  "ip" TEXT, "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_cliente_sessoes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "portal_cliente_acessos_log" (
  "id" TEXT NOT NULL, "empresaId" TEXT, "contatoId" TEXT, "email" TEXT NOT NULL,
  "evento" TEXT NOT NULL, "detalhe" TEXT, "ip" TEXT, "userAgent" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_cliente_acessos_log_pkey" PRIMARY KEY ("id")
);

-- Exceções deliberadas ao RLS: credenciais, sessões e tentativas de acesso são
-- consultadas antes de existir um tenant autenticado. Não armazenam dados de
-- negócio e toda credencial fixa empresaId/contatoId para o contexto posterior.

CREATE UNIQUE INDEX "cliente_contatos_empresaId_clienteId_email_key" ON "cliente_contatos"("empresaId", "clienteId", "email");
CREATE INDEX "cliente_contatos_empresaId_clienteId_ativo_idx" ON "cliente_contatos"("empresaId", "clienteId", "ativo");
CREATE UNIQUE INDEX "portal_cliente_configs_empresaId_key" ON "portal_cliente_configs"("empresaId");
CREATE UNIQUE INDEX "portal_cliente_perfis_empresaId_nome_key" ON "portal_cliente_perfis"("empresaId", "nome");
CREATE UNIQUE INDEX "portal_cliente_rotinas_codigo_key" ON "portal_cliente_rotinas"("codigo");
CREATE UNIQUE INDEX "portal_cliente_perfil_permissoes_perfilId_rotinaId_acao_key" ON "portal_cliente_perfil_permissoes"("perfilId", "rotinaId", "acao");
CREATE INDEX "portal_cliente_perfil_permissoes_empresaId_perfilId_idx" ON "portal_cliente_perfil_permissoes"("empresaId", "perfilId");
CREATE UNIQUE INDEX "portal_cliente_habilitacoes_clienteId_key" ON "portal_cliente_habilitacoes"("clienteId");
CREATE INDEX "portal_cliente_habilitacoes_empresaId_ativo_idx" ON "portal_cliente_habilitacoes"("empresaId", "ativo");
CREATE UNIQUE INDEX "portal_cliente_credenciais_contatoId_key" ON "portal_cliente_credenciais"("contatoId");
CREATE UNIQUE INDEX "portal_cliente_credenciais_empresaAlias_emailNormalizado_key" ON "portal_cliente_credenciais"("empresaAlias", "emailNormalizado");
CREATE INDEX "portal_cliente_credenciais_empresaId_idx" ON "portal_cliente_credenciais"("empresaId");
CREATE UNIQUE INDEX "portal_cliente_sessoes_tokenHash_key" ON "portal_cliente_sessoes"("tokenHash");
CREATE INDEX "portal_cliente_sessoes_credencialId_expiresAt_idx" ON "portal_cliente_sessoes"("credencialId", "expiresAt");
CREATE INDEX "portal_cliente_acessos_log_empresaId_criadoEm_idx" ON "portal_cliente_acessos_log"("empresaId", "criadoEm");

ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "portal_cliente_perfis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_configs" ADD CONSTRAINT "portal_cliente_configs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_perfis" ADD CONSTRAINT "portal_cliente_perfis_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "portal_cliente_perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_perfil_permissoes" ADD CONSTRAINT "portal_cliente_perfil_permissoes_rotinaId_fkey" FOREIGN KEY ("rotinaId") REFERENCES "portal_cliente_rotinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_habilitacoes" ADD CONSTRAINT "portal_cliente_habilitacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_habilitacoes" ADD CONSTRAINT "portal_cliente_habilitacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_credenciais" ADD CONSTRAINT "portal_cliente_credenciais_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "cliente_contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_cliente_sessoes" ADD CONSTRAINT "portal_cliente_sessoes_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "portal_cliente_credenciais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orcamentos" ADD COLUMN "clienteDecididoEm" TIMESTAMP(3),
ADD COLUMN "clienteDecididoPorContatoId" TEXT,
ADD COLUMN "clienteDecisao" TEXT,
ADD COLUMN "clienteDecisaoObservacao" TEXT;
CREATE INDEX "orcamentos_empresaId_clienteDecididoPorContatoId_idx" ON "orcamentos"("empresaId", "clienteDecididoPorContatoId");
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteDecididoPorContatoId_fkey" FOREIGN KEY ("clienteDecididoPorContatoId") REFERENCES "cliente_contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "portal_cliente_rotinas" ("id", "codigo", "nome", "ordem") VALUES
('portal-rotina-cadastro','cadastro','Meu cadastro',1),
('portal-rotina-contatos','contatos','Contatos',2),
('portal-rotina-notas','notas','Notas fiscais',3),
('portal-rotina-compras','compras','Histórico de compras',4),
('portal-rotina-titulos','titulos','Títulos',5),
('portal-rotina-orcamentos','orcamentos','Orçamentos',6),
('portal-rotina-catalogo','catalogo','Catálogo',7),
('portal-rotina-carrinho','carrinho','Carrinho',8)
ON CONFLICT ("codigo") DO NOTHING;

ALTER TABLE "cliente_contatos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_contatos ON "cliente_contatos" USING ("empresaId" = current_setting('app.current_empresa_id', true));
ALTER TABLE "portal_cliente_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_configs ON "portal_cliente_configs" USING ("empresaId" = current_setting('app.current_empresa_id', true));
ALTER TABLE "portal_cliente_perfis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_perfis ON "portal_cliente_perfis" USING ("empresaId" = current_setting('app.current_empresa_id', true));
ALTER TABLE "portal_cliente_perfil_permissoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_perfil_permissoes ON "portal_cliente_perfil_permissoes" USING ("empresaId" = current_setting('app.current_empresa_id', true));
ALTER TABLE "portal_cliente_habilitacoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_cliente_habilitacoes ON "portal_cliente_habilitacoes" USING ("empresaId" = current_setting('app.current_empresa_id', true));
