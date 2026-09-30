-- Uso por rotina (Administração > Acessos > "Uso por Rotina"): quantas vezes
-- cada usuário abriu cada tela, por dia. O web avisa ao abrir a tela; a API
-- descobre a rotina pela rota do menu.
CREATE TABLE "uso_rotinas" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "rotinaId" TEXT NOT NULL,
  "dia" DATE NOT NULL,
  "acessos" INTEGER NOT NULL DEFAULT 0,
  "ultimoAcessoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "uso_rotinas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uso_rotinas_empresaId_usuarioId_rotinaId_dia_key"
  ON "uso_rotinas"("empresaId", "usuarioId", "rotinaId", "dia");
CREATE INDEX "uso_rotinas_empresaId_dia_idx" ON "uso_rotinas"("empresaId", "dia");

ALTER TABLE "uso_rotinas" ADD CONSTRAINT "uso_rotinas_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uso_rotinas" ADD CONSTRAINT "uso_rotinas_rotinaId_fkey"
  FOREIGN KEY ("rotinaId") REFERENCES "rotinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "uso_rotinas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_uso_rotinas ON "uso_rotinas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
