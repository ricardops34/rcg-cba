# Feriados na agenda e no financeiro

Regra aprovada: feriados cadastrados na empresa ativa, sábados e domingos não
são dias úteis. O próximo dia útil considera feriados consecutivos e virada do
ano. Cada empresa mantém seu próprio calendário; é necessário cadastrar/gerar
os feriados dos anos utilizados.

- Agenda CRM destaca o nome do feriado. A consulta exige acesso a atividades,
  sem conceder acesso ao cadastro administrativo de feriados.
- Compromissos manuais permitem manter a data não útil após confirmação.
- Atividades automáticas, retornos de orçamento e mensagens agendadas de WhatsApp
  passam ao próximo dia útil, mantendo o horário no fuso operacional.
- Agente IA consulta feriados e informa no cartão de confirmação que datas não
  úteis serão ajustadas. A regra é executada no servidor, também para os demais
  canais. A data retornada pela operação é a data efetivamente agendada.
- Mensagens pendentes não são disparadas em dias não úteis, inclusive se o
  feriado foi cadastrado depois do agendamento.
- Datas históricas de atividades concluídas não são ajustadas. Não há alteração
  em massa de compromissos já cadastrados.

## Títulos

O vencimento original do ERP permanece armazenado e visível. `vencimentoEfetivo`
é calculado em consulta e exibido separadamente quando diferente. Esse vencimento
é usado para status, filtros de atraso, janela de reemissão, juros e multa,
incluindo posição de cliente, notificações e ferramentas do agente/WhatsApp.
Não há encargos até o dia útil ajustado; depois dele, contam-se dias corridos
de atraso. A data/código de um boleto registrado não é alterada apenas por cair
em feriado; o cálculo de encargos usa a data efetiva.

Não confundir `vencimentoEfetivo` com `vencimentoReal`, que é um campo recebido
do ERP. A integração continua preservando os campos enviados pelo ERP. Retornos
recebidos pela integração geram atividades com data útil, preservando a data
solicitada no orçamento de origem.

A regra compartilhada está em `common/horario/calendario-util.ts`: datas de
títulos são datas civis UTC; datas de compromissos são instantes no fuso
operacional `America/Campo_Grande`. Consultas de feriados sempre usam `withTenant`.
