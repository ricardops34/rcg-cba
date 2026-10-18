# Perguntas para Validação Humana — plataforma-comercial (rcg)

> Gerado pelo Revisor em 2026-10-16. Modo de resposta: **file**.
> Responda cada pergunta preenchendo o campo `**Resposta:**` e avise digitando `reversa` quando terminar.

---

## Pergunta 1

**Contexto:** Módulo `equipamentos-comodato` / `clientes` — constante `COMODATO_DIAS_SEM_CONSUMO = 30` em `apps/api/src/modules/clientes/comodato-sql.ts:50`
**Spec afetada:** [`_reversa_sdd/clientes/requirements.md`](file:///c:/VPS/rcg/_reversa_sdd/clientes/requirements.md#L35)
**Pergunta:** A janela de 30 dias sem compra de produtos consumíveis para disparar o aviso de "Comodato sem consumo" deve permanecer fixa em 30 dias ou deve se tornar configurável por empresa ou por tipo de equipamento no futuro?
**Impacto:** Se configurável, adiciona campo na tabela `parametros_empresa` e altera a expressão SQL para ler o parâmetro da empresa.

**Resposta:** Configuravel por Cliente

---

## Pergunta 2

**Contexto:** Módulo `notas-saida` — filtro de Corte de Venda em `apps/api/src/modules/notas-saida/notas-saida.service.ts:180`
**Spec afetada:** [`_reversa_sdd/notas-saida/requirements.md`](file:///c:/VPS/rcg/_reversa_sdd/notas-saida/requirements.md)
**Pergunta:** A regra de ouro do Corte de Vendas exige `geraDuplicata = true`, série em `VENDAS_SERIES_NOTA` (1) e categoria com `usado = true`. Produtos novos não são considerados no volume de corte de vendas para fins de comissão/metas, ou essa regra reflete apenas o perfil de faturamento de seminovos/recondicionados?
**Impacto:** Define a categorização contábil exata no dashboard gerencial e nos relatórios de faturamento.

**Resposta:** Não entendia pergunta

---

## Pergunta 3

**Contexto:** Módulo `politica-senha` / `auth` — função `validarSenhaDoUsuario` em `apps/api/src/modules/auth/auth.service.ts:75`
**Spec afetada:** [`_reversa_sdd/auth/requirements.md`](file:///c:/VPS/rcg/_reversa_sdd/auth/requirements.md)
**Pergunta:** Para empresas recém-criadas sem registro explícito em `politica_senha`, o sistema deve adotar um lockout padrão rígido (ex: 5 tentativas e 15 minutos de bloqueio) ou permitir tentativas ilimitadas até que o administrador configure a política?
**Impacto:** Se rígido, garante proteção imediata contra força bruta desde o momento do seed da empresa.

**Resposta:** Configurado no primeiro acesso do Admin da Empresa

---

## Pergunta 4

**Contexto:** Módulo `clientes` / `cliente-alteracoes` — tabela `cliente_alteracoes` em `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:250`
**Spec afetada:** [`_reversa_sdd/clientes/requirements.md`](file:///c:/VPS/rcg/_reversa_sdd/clientes/requirements.md)
**Pergunta:** Solicitações de alteração cadastral que permaneçam pendentes na fila por longo período (ex: > 90 dias) devem expirar automaticamente com notificação ao vendedor ou devem permanecer abertas até ação explícita do supervisor?
**Impacto:** Define a necessidade de um job cron de expiração e limpeza de propostas obsoletas.

**Resposta:** Prazo personalizavel, e sem aprovação notificar o altor em um prazo configuravel. Podem o mesmo excluir o ajuste

---

## Pergunta 5

**Contexto:** Módulo `integracao` / `orcamentos` — exportação de pedidos para o Protheus em `apps/api/src/modules/integracao/integracao-pedidos.service.ts`
**Spec afetada:** [`_reversa_sdd/orcamentos/requirements.md`](file:///c:/VPS/rcg/_reversa_sdd/orcamentos/requirements.md)
**Pergunta:** Quando um pedido exportado para o Protheus (SC5) sofre alteração manual diretamente no ERP, a plataforma deve reimportar as alterações atualizando o orçamento original ou o orçamento na plataforma permanece congelado como a proposta comercial contratada?
**Impacto:** Estabelece a autoridade da verdade histórica entre CRM de vendas e ERP contábil.

**Resposta:** Deve retornar a plataforma

