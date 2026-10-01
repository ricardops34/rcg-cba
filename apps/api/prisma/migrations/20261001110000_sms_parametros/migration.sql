-- SMS: chave de habilitar e uma chave por funcionalidade, nos parâmetros da
-- empresa, ao lado do SMS_TOKEN (decisão do usuário, 01/10/2026: a
-- configuração fica em Parâmetros, editada junta pela tela Administração >
-- SMS, sem tabela própria). O botão de cada funcionalidade só aparece com
-- SMS_ATIVO ligado, token preenchido e ela ligada. SMS_ATIVO nasce desligado.
-- `NULL::integer` na primeira linha: com todos os tamanhos nulos o Postgres
-- deduz a coluna do VALUES como texto e o INSERT falha (42804).
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."id", p."parametro", p."tipo"::"TipoParametro",
       p."tamanho", p."conteudo", p."descricao", true, now(), now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('SMS_ATIVO', 'booleano', NULL::integer, 'false', 'Habilita o envio de SMS pela iAgente nesta empresa'),
    ('SMS_BOLETO', 'booleano', NULL, 'true', 'Permite enviar boleto por SMS (valor, vencimento e linha digitável)'),
    ('SMS_COBRANCA', 'booleano', NULL, 'true', 'Permite enviar cobrança de títulos vencidos por SMS'),
    ('SMS_MENSAGEM_LIVRE', 'booleano', NULL, 'true', 'Permite enviar mensagem livre por SMS ao cliente'),
    ('SMS_SENHA_PROVISORIA', 'booleano', NULL, 'true', 'Envia a senha provisória do vendedor também por SMS')
) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

UPDATE "parametros_empresa"
   SET "descricao" = 'Token da API de SMS da iAgente (sk_live_...), gerado no painel da iAgente'
 WHERE "parametro" = 'SMS_TOKEN';
