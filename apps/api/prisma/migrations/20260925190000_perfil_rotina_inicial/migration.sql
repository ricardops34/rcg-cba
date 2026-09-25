-- AlterTable
ALTER TABLE "perfis" ADD COLUMN "rotinaInicialId" TEXT;

-- AddForeignKey
ALTER TABLE "perfis" ADD CONSTRAINT "perfis_rotinaInicialId_fkey" FOREIGN KEY ("rotinaInicialId") REFERENCES "rotinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
