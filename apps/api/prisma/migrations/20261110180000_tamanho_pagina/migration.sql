-- Tamanho das listagens paginadas personalizável (decisão de 2026-11-10):
-- padrão no perfil, o usuário troca o seu em "Meu perfil", e o do usuário
-- vale acima do perfil. Nulo nos dois = o padrão de cada tela.
--
-- Só colunas em tabelas que já têm RLS (perfis e usuarios, por grupo
-- econômico): as policies existentes cobrem as colunas novas.
-- Os valores aceitos são os de TAMANHOS_PAGINA (contratos); o CHECK repete a
-- regra no banco para nenhum caminho gravar um tamanho que a API recusaria.

ALTER TABLE "perfis" ADD COLUMN "tamanhoPagina" INTEGER;
ALTER TABLE "perfis" ADD CONSTRAINT "perfis_tamanhoPagina_check"
  CHECK ("tamanhoPagina" IS NULL OR "tamanhoPagina" IN (10, 20, 50, 100));

ALTER TABLE "usuarios" ADD COLUMN "tamanhoPagina" INTEGER;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tamanhoPagina_check"
  CHECK ("tamanhoPagina" IS NULL OR "tamanhoPagina" IN (10, 20, 50, 100));
