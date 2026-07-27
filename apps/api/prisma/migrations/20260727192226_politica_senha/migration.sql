-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "bloqueadoAte" TIMESTAMP(3),
ADD COLUMN     "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senhaAlteradaEm" TIMESTAMP(3),
ADD COLUMN     "tentativasFalhas" INTEGER NOT NULL DEFAULT 0;

-- Usuários existentes nascem com a senha "da idade" do próprio cadastro,
-- para o cálculo de expiração não tratar toda a base como recém-trocada.
UPDATE "usuarios" SET "senhaAlteradaEm" = "createdAt" WHERE "senhaAlteradaEm" IS NULL;

-- CreateTable
CREATE TABLE "politica_senha" (
    "id" TEXT NOT NULL,
    "tamanhoMinimo" INTEGER NOT NULL DEFAULT 8,
    "tamanhoMaximo" INTEGER,
    "exigirMaiuscula" BOOLEAN NOT NULL DEFAULT true,
    "exigirMinuscula" BOOLEAN NOT NULL DEFAULT false,
    "exigirNumero" BOOLEAN NOT NULL DEFAULT true,
    "exigirEspecial" BOOLEAN NOT NULL DEFAULT false,
    "diasParaExpirar" INTEGER,
    "historicoQuantidade" INTEGER NOT NULL DEFAULT 0,
    "tentativasAntesBloqueio" INTEGER NOT NULL DEFAULT 5,
    "minutosBloqueio" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "politica_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senha_historico" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senha_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "senha_historico_usuarioId_createdAt_idx" ON "senha_historico"("usuarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "senha_historico" ADD CONSTRAINT "senha_historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
