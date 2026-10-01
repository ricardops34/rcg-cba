-- Executada pela role dona, como as demais migrations de dados com RLS.
-- Um único WhatsApp: celular é canônico; telefone fica como espelho de compatibilidade.
-- Prioridade: WhatsApp existente, telefone da conta, telefone único dos vendedores.
WITH numeros AS (
  SELECT u."id", COALESCE(
    NULLIF(regexp_replace(u."celular", '[^0-9]', '', 'g'), ''),
    NULLIF(regexp_replace(u."telefone", '[^0-9]', '', 'g'), ''),
    (SELECT CASE WHEN COUNT(DISTINCT NULLIF(regexp_replace(v."telefone", '[^0-9]', '', 'g'), '')) = 1
       THEN MIN(NULLIF(regexp_replace(v."telefone", '[^0-9]', '', 'g'), '')) END
     FROM "vendedores" v JOIN "empresas" e ON e."id" = v."empresaId"
     WHERE v."usuarioId" = u."id" AND v."deletedAt" IS NULL
       AND e."grupoEconomicoId" = u."grupoEconomicoId")
  ) AS numero FROM "usuarios" u
)
UPDATE "usuarios" u SET "celular" = n.numero, "telefone" = n.numero
FROM numeros n WHERE u."id" = n."id";

UPDATE "vendedores" v SET "telefone" = u."celular"
FROM "usuarios" u, "empresas" e
WHERE v."usuarioId" = u."id" AND e."id" = v."empresaId"
  AND e."grupoEconomicoId" = u."grupoEconomicoId" AND v."deletedAt" IS NULL
  AND u."celular" IS NOT NULL;
