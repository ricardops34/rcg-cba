-- "Esqueci minha senha" por link de uso único enviado por e-mail.
--
-- Guarda só o hash do token. Sem empresaId e sem RLS, como refresh_tokens: o
-- pedido chega antes do login, e o usuário é da conta, não de uma empresa.

CREATE TABLE "senha_redefinicoes" (
  "id"        TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiraEm"  TIMESTAMP(3) NOT NULL,
  "usadoEm"   TIMESTAMP(3),
  "ip"        TEXT,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "senha_redefinicoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "senha_redefinicoes_usuarioId_fkey" FOREIGN KEY ("usuarioId")
    REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "senha_redefinicoes_tokenHash_key" ON "senha_redefinicoes"("tokenHash");
CREATE INDEX "senha_redefinicoes_usuarioId_idx" ON "senha_redefinicoes"("usuarioId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "senha_redefinicoes" TO plataforma_app;

-- Rastro de acessos: o pedido do link e a senha trocada por ele.
ALTER TYPE "AcessoEvento" ADD VALUE IF NOT EXISTS 'senha_redefinicao_pedida';
ALTER TYPE "AcessoEvento" ADD VALUE IF NOT EXISTS 'senha_redefinida';
