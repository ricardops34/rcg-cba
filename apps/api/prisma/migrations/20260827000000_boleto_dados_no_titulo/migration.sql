-- O título passa a carregar o desenho inteiro do boleto, e não só a
-- identificação dele. Antes, tudo que o PDF precisa além de nosso número,
-- carteira e código de barras vinha de `contas_bancarias`; agora o ERP manda
-- junto, porque é ele quem registra o boleto no banco.
--
-- Todas as colunas são NULL: título importado antes desta migration continua
-- sendo emitido pelo cadastro de conta de cobrança, sem mudança nenhuma. A
-- precedência é a mesma que a coluna `carteira` já tinha — preenchido no
-- título, vence a conta; nulo, cai nela.
--
-- Sem índice: nenhuma dessas colunas é critério de busca, só de impressão.

ALTER TABLE "titulos_receber"
  ADD COLUMN "nossoNumeroDac"         TEXT,
  ADD COLUMN "banco"                  TEXT,
  ADD COLUMN "bancoNome"              TEXT,
  ADD COLUMN "bancoCodigoCompensacao" TEXT,
  ADD COLUMN "agencia"                TEXT,
  ADD COLUMN "agenciaDv"              TEXT,
  ADD COLUMN "conta"                  TEXT,
  ADD COLUMN "contaDv"                TEXT,
  ADD COLUMN "beneficiarioNome"       TEXT,
  ADD COLUMN "beneficiarioDocumento"  TEXT,
  ADD COLUMN "beneficiarioEndereco"   TEXT,
  ADD COLUMN "localPagamento"         TEXT,
  ADD COLUMN "aceite"                 TEXT,
  ADD COLUMN "especieDocumento"       TEXT,
  ADD COLUMN "jurosValorDia"          DOUBLE PRECISION,
  ADD COLUMN "multaValor"             DOUBLE PRECISION,
  ADD COLUMN "descontoValor"          DOUBLE PRECISION,
  ADD COLUMN "instrucoes"             TEXT;
