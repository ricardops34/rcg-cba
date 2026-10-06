-- Instância do WhatsApp presa a empresa + usuário + vendedor + número
-- (decisão do usuário, 2026-10-06).
--
-- 1. `usuarioId` na sessão: quem conectou. O Atendimento, o sino, as ações e
--    o agente exigem que confira com quem está logado, além do vendedor.
--    Backfill pelo vínculo atual vendedor → usuário; sessão de vendedor sem
--    usuário fica nula e não aparece para ninguém até alguém reconectar.
--
-- 2. `whatsapp_numero_em_uso`: o número do vendedor é único. As conversas
--    "misturadas entre empresas" vinham do mesmo celular pareado em duas
--    sessões — o WhatsApp aceita vários aparelhos vinculados, e cada
--    instância recebia tudo. A consulta precisa atravessar empresas, e a
--    policy de `whatsapp_sessoes` só enxerga a empresa ativa (nem o modo
--    sistema a libera), daí SECURITY DEFINER — mesmo molde de
--    `app_grupo_atual`. Devolve só ids — nem credencial, nem nome de empresa
--    ou vendedor, que vazariam outro cliente da plataforma para quem tentou
--    conectar; o detalhe vai para o log da API.

ALTER TABLE "whatsapp_sessoes" ADD COLUMN "usuarioId" TEXT;

ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "whatsapp_sessoes" s
SET "usuarioId" = v."usuarioId"
FROM "vendedores" v
WHERE v."id" = s."vendedorId"
  AND s."tipo" = 'vendedor'
  AND s."usuarioId" IS NULL;

CREATE FUNCTION whatsapp_numero_em_uso(p_numero text, p_sessao_id text)
  RETURNS TABLE ("sessaoId" text, "empresaId" text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT s."id", s."empresaId"
    FROM "whatsapp_sessoes" s
    WHERE s."numero" = p_numero
      AND s."id" <> p_sessao_id
      AND s."status" IN ('conectada', 'pareando')
  $$;
