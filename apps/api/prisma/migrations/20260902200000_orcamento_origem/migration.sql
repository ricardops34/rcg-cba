-- Origem da venda no orçamento: quem **executou**, não de quem é a carteira.
--
-- A regra de negócio (decisão do usuário em 2026-09-02): toda venda continua
-- vinculada ao vendedor que atende o cliente — inclusive quando quem montou o
-- orçamento foi o administrador, o gerente ou o supervisor, que vendem na
-- carteira do subordinado. O vínculo já era assim (`OrcamentosService.create`
-- usa o vendedor do cadastro do cliente); o que faltava era registrar **quem
-- originou**, para que comissão e leitura de desempenho não tratem "o vendedor
-- fez" e "o supervisor fez pelo vendedor" como a mesma coisa.
--
-- `cliente` existe para a venda que nasce no portal do cliente.
--
-- O histórico fica como `vendedor`: não há como descobrir, depois, quem
-- digitou cada orçamento antigo — `createdBy` diz o usuário, mas o papel dele
-- naquele momento (e o dono da carteira naquele dia) não está guardado em
-- lugar nenhum. Marcar tudo como `vendedor` é o único palpite honesto: é o
-- caso da esmagadora maioria.

CREATE TYPE "OrigemVenda" AS ENUM (
  'vendedor',
  'supervisor',
  'gerente',
  'administrador',
  'cliente'
);

ALTER TABLE "orcamentos"
  ADD COLUMN "origem" "OrigemVenda" NOT NULL DEFAULT 'vendedor';
