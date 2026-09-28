-- Campos `D` do ERP representam datas civis, sem hora nem fuso. Mantê-los
-- como TIMESTAMP permitia que clientes convertessem meia-noite UTC para o dia
-- anterior. Os DateTime reais da plataforma (auditoria, recebimento e envio)
-- permanecem TIMESTAMP.

ALTER TABLE "vendedores"
  ALTER COLUMN "dataNascimento" TYPE DATE USING "dataNascimento"::date;

ALTER TABLE "clientes"
  ALTER COLUMN "dataNascimento" TYPE DATE USING "dataNascimento"::date,
  ALTER COLUMN "vencimentoLimite" TYPE DATE USING "vencimentoLimite"::date,
  ALTER COLUMN "dataBloqueio" TYPE DATE USING "dataBloqueio"::date,
  ALTER COLUMN "dataReativacao" TYPE DATE USING "dataReativacao"::date,
  ALTER COLUMN "primeiraCompra" TYPE DATE USING "primeiraCompra"::date,
  ALTER COLUMN "ultimaVisita" TYPE DATE USING "ultimaVisita"::date,
  ALTER COLUMN "ultimaCompra" TYPE DATE USING "ultimaCompra"::date,
  ALTER COLUMN "ultimoAtendimento" TYPE DATE USING "ultimoAtendimento"::date,
  ALTER COLUMN "dataConsultaRfb" TYPE DATE USING "dataConsultaRfb"::date;

ALTER TABLE "tabelas_preco"
  ALTER COLUMN "dtInicio" TYPE DATE USING "dtInicio"::date,
  ALTER COLUMN "dtFim" TYPE DATE USING "dtFim"::date;

ALTER TABLE "estoques"
  ALTER COLUMN "ultimaCompra" TYPE DATE USING "ultimaCompra"::date;

ALTER TABLE "notas_saida"
  ALTER COLUMN "dtEmissao" TYPE DATE USING "dtEmissao"::date,
  ALTER COLUMN "dtNfe" TYPE DATE USING "dtNfe"::date;

ALTER TABLE "notas_saida_itens"
  ALTER COLUMN "dtEmissao" TYPE DATE USING "dtEmissao"::date;

ALTER TABLE "notas_entrada"
  ALTER COLUMN "dtEmissao" TYPE DATE USING "dtEmissao"::date,
  ALTER COLUMN "dtEntrada" TYPE DATE USING "dtEntrada"::date,
  ALTER COLUMN "dtNfe" TYPE DATE USING "dtNfe"::date;

ALTER TABLE "notas_entrada_itens"
  ALTER COLUMN "dtEmissao" TYPE DATE USING "dtEmissao"::date;

ALTER TABLE "titulos_receber"
  ALTER COLUMN "emissao" TYPE DATE USING "emissao"::date,
  ALTER COLUMN "vencimento" TYPE DATE USING "vencimento"::date,
  ALTER COLUMN "vencimentoReal" TYPE DATE USING "vencimentoReal"::date,
  ALTER COLUMN "dtBaixa" TYPE DATE USING "dtBaixa"::date;

ALTER TABLE "orcamentos"
  ALTER COLUMN "dataValidade" TYPE DATE USING "dataValidade"::date;
