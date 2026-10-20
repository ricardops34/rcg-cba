-- Terceiro estado para o campo do cliente: além de permitir/bloquear, "se_vazio"
-- (edita enquanto o cadastro não tem valor). `editavel` continua gravado em
-- paralelo (modo = 'permitir'), para quem ainda lê a coluna antiga.
ALTER TABLE "cliente_campo_config"
  ADD COLUMN "modo" TEXT NOT NULL DEFAULT 'permitir';

UPDATE "cliente_campo_config"
SET "modo" = CASE WHEN "editavel" THEN 'permitir' ELSE 'bloquear' END;
