-- Administração do SaaS: situação da empresa, teste com prazo, teto de
-- usuários e o log do que o administrador da plataforma faz.
--
-- **Por que `situacao` substitui `ativo` em vez de conviver com ele.** O
-- booleano dizia "pode entrar"; a situação diz isso e mais o porquê. Manter os
-- dois obrigaria a mantê-los coerentes para sempre, e uma empresa com
-- `ativo = true` e `situacao = suspensa` não teria resposta certa — o login
-- leria um, a tela leria o outro. É o mesmo defeito que `supervisorId` e
-- `gerenteId` tinham (20260903120000_vendedor_superior), e a saída é a mesma:
-- um campo só, e quem decide o acesso é uma função só.
--
-- Conversão: quem estava ativo vira `ativa`, quem não estava vira `suspensa`.
-- Ninguém nasce em `teste` — o período de avaliação é decisão de quem
-- administra, não do estado anterior, e marcar as existentes como teste daria
-- prazo de expiração a cliente que já paga.

CREATE TYPE "SituacaoEmpresa" AS ENUM ('teste', 'ativa', 'suspensa', 'cancelada');

ALTER TABLE "empresas" ADD COLUMN "situacao" "SituacaoEmpresa" NOT NULL DEFAULT 'ativa';
ALTER TABLE "empresas" ADD COLUMN "testeExpiraEm" TIMESTAMP(3);
ALTER TABLE "empresas" ADD COLUMN "limiteUsuarios" INTEGER;

UPDATE "empresas" SET "situacao" = 'suspensa' WHERE "ativo" = false;

ALTER TABLE "empresas" DROP COLUMN "ativo";

-- Log do administrador da plataforma.
--
-- Sem RLS, e é deliberado: as tabelas de negócio têm policy porque carregam
-- dado de **uma** empresa; esta carrega o registro de ações **sobre** as
-- empresas, feitas por quem está acima delas. Uma policy por
-- `app.current_empresa_id` deixaria o log invisível justamente para quem
-- precisa dele. O corte é o `PlatformAdminGuard`, na aplicação — mesmo
-- raciocínio já documentado para `integracao_api_keys` e `acessos_log` no
-- README de migrations.
CREATE TABLE "plataforma_auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "empresaId" TEXT,
    "empresaRazaoSocial" TEXT,
    "acao" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plataforma_auditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plataforma_auditoria_empresaId_createdAt_idx"
  ON "plataforma_auditoria"("empresaId", "createdAt");
CREATE INDEX "plataforma_auditoria_createdAt_idx"
  ON "plataforma_auditoria"("createdAt");

-- A API grava o log com o role de runtime.
GRANT SELECT, INSERT, UPDATE, DELETE ON "plataforma_auditoria" TO plataforma_app;
