-- Libera o Agente IA para a equipe comercial (Vendedor, Supervisor, Gerente).
--
-- Até aqui só o Administrador tinha as rotinas do agente, então o ícone
-- flutuante não aparecia para ninguém do comercial — que é justamente o
-- público dele.
--
-- São quatro rotinas, e as três últimas não são detalhe: o catálogo de
-- ferramentas enviado ao modelo é filtrado pela permissão do usuário
-- (`AgenteToolsService.disponiveisPara`). Sem elas o agente até responde, mas
-- não enxerga histórico de vendas nem a sugestão de compra — exatamente as
-- perguntas que o vendedor faria.
--
--   agente                   -> usar o agente (obrigatória; sem ela nada aparece)
--   sugestao-compra          -> ferramenta sugerir_compras
--   consulta-vendas-cliente  -> ferramenta vendas_por_cliente
--   consulta-vendas-produto  -> ferramenta vendas_por_produto
--
-- Só `visualizar`. As ações de escrita do agente (criar_orcamento) continuam
-- valendo pela permissão da própria rotina de orçamentos, que estes perfis já
-- têm — e mesmo assim nada é gravado sem o Confirmar do usuário na tela.
--
-- `agente-config` fica **de fora** de propósito: é a tela que guarda a chave de
-- API e a conta ChatGPT conectada, e continua exclusiva do Administrador.

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-' || r."codigo" || '-' || p."id" || '-visualizar',
  p."id",
  r."id",
  'visualizar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE p."nome" IN ('Vendedor', 'Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
  AND r."codigo" IN (
    'agente',
    'sugestao-compra',
    'consulta-vendas-cliente',
    'consulta-vendas-produto'
  )
  AND r."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;
