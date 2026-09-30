-- Grupo econômico: "nome" vira "descricao".
--
-- Decisão do usuário (30/09/2026): o grupo tem o ID (uuid, como empresas e os
-- demais cadastros) e uma Descrição. A hierarquia é Grupo econômico → Empresa:
-- a composição (empresas.grupoEconomicoId) é mantida pela administração da
-- plataforma.

ALTER TABLE "grupos_economicos" RENAME COLUMN "nome" TO "descricao";
