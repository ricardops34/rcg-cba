# WhatsApp — agendamento de mensagens, notas e agendamento de atendimento

> Criado em 2026-10-16. **Documento vivo:** atualizar a cada decisão e a cada entrega.
> Pedido do usuário: nas telas de conversa por WhatsApp, três recursos —
> (1) **agendar envio de mensagem**; (2) **notas** que ficam na conversa, só na plataforma, visíveis a usuário,
> supervisor e gerente; (3) **agendamento de atendimento** que gera anotação na agenda e, na data e hora marcadas,
> avisa o vendedor na plataforma e inicia uma conversa por WhatsApp.
> Todos os agendamentos se registram em **Atendimentos** e **Agenda**, e podem ser **alterados ou cancelados antes do envio**.

## Decisões do roteiro semanal (questionário respondido em 2026-10-16)

Desenho e fases em **§7**. Respostas completas: [2026-10-16-questionario-roteiro-semanal.md](2026-10-16-questionario-roteiro-semanal.md).

## 1. O que já existe (verificado no código em 2026-10-16)

| Recurso | Situação hoje | Onde |
|---|---|---|
| Mensagem agendada | Criar, listar e **cancelar**. Rotina a cada minuto envia; ajusta para dia útil; falha vira `erro` visível + notificação no sino; só texto | `whatsapp-agendamento.service.ts`, tabela `whatsapp_mensagens_agendadas`, `composer.tsx` ("Já agendadas") |
| Nota interna | Grava evento `anotacao` na linha do tempo da conversa; **não vai ao cliente nem ao provedor**; aparece no histórico gerencial; vale o escopo da conversa (dono, supervisor, gerente) | `anotar` em `whatsapp-conversas.service.ts`, `anotacao-dialog.tsx` |
| Agendar visita/retorno | Cria uma **Atividade** (tipo visita) na agenda do vendedor, ligada ao cliente | `agendarVisita` em `whatsapp-acoes.service.ts`, `acoes-cliente.tsx` |
| Aviso de atividade | Notificação "atividade vence hoje/venceu", varredura a cada 30 min, **sem hora exata** e sem abrir conversa | `notificacoes-varredura.service.ts` |
| Atendimento no histórico | Um registro **por cliente por dia**, criado **quando a mensagem sai** | `registrar-atendimento-whatsapp.ts` |

## 2. Lacunas frente ao pedido

### A. Agendar mensagem
- **Falta alterar** (texto e data/hora) — hoje só cancela.
- **Não aparece na Agenda:** o agendamento só vira registro quando a mensagem **sai**; antes disso o vendedor não o vê na agenda nem nos atendimentos.
- **Cancelar/alterar** precisa refletir na agenda e no histórico (hoje não há registro para refletir).
- Continua só texto (anexo agendado exigiria guardar o arquivo até a hora — ver `whatsapp-vendedor.md`).

### B. Notas
- A regra de visibilidade (usuário, supervisor, gerente; nunca o cliente) **já vale** pelo escopo da conversa. A confirmar na tela: distinção visual de "nota interna" na conversa.
- Opcional, não pedido: editar/excluir nota.

### C. Agendamento de atendimento
- O "Agendar visita ou retorno" cria a Atividade, mas **não a liga à conversa**.
- **Não avisa na hora marcada** (só "vence hoje", a cada 30 min).
- **Não inicia conversa**: a notificação não abre a conversa do cliente.
- Sem situação "cancelado" para a atividade agendada por aqui (hoje: concluir ou excluir).

## 3. Desenho proposto

**Princípio:** a **Atividade** é o registro único na Agenda/Atendimentos; os agendamentos de WhatsApp apontam para ela. Assim a Agenda já existente mostra tudo, sem tela nova de listagem.

1. **Mensagem agendada ↔ Atividade.** Ao agendar, cria-se uma Atividade (agenda, no horário do envio, ligada ao cliente e à conversa); a mensagem agendada guarda o `atividadeId`. Alterar/cancelar a mensagem altera/cancela a Atividade. Ao enviar, a Atividade é concluída.
2. **Atendimento agendado.** Atividade tipo `visita`/`retorno` com `conversaId` (ou contato) e o marcador "iniciar conversa". A rotina de 1 min (a mesma do envio) dispara, **na hora marcada**, uma notificação no sino com link que **abre a conversa** (criando-a se não existir).
3. **Notas:** manter como estão; ajuste visual e, se pedido, edição.
4. **Tela:** na conversa, um painel **"Agendamentos"** lista mensagens e atendimentos pendentes, com **Alterar** e **Cancelar**. No celular, abre em tela cheia.

### Pontos de implementação
- Migration: `atividades.conversaId` (opcional), `whatsapp_mensagens_agendadas.atividadeId` (opcional). Tabelas já têm RLS; coluna nova não exige policy.
- Sem usuário logado na hora do disparo: o agendamento é autorizado **na criação** (como já é para a mensagem), o disparo só registra.
- Cancelamento: Atividade ganha desfecho "cancelada" (hoje só `concluida`/`ativo`) — decidir entre soft delete e novo campo.
- Idempotência entre réplicas: mesmo padrão `pendente → enviando` por atualização condicional.

## 4. Decisões pendentes (usuário)

| # | Decisão | Proposta | Resposta |
|---|---|---|---|
| D1 | Na hora do atendimento agendado, o que acontece com a conversa? | Avisa o vendedor e **abre a conversa pronta, sem enviar nada** — quem decide o que dizer é o vendedor | **Aprovado (2026-10-16)** |
| D2 | O que se pode alterar numa mensagem agendada? | Texto e data/hora, enquanto `pendente` | **Aprovado (2026-10-16)** |
| D3 | Quem recebe o aviso? | _ver quadro no topo_ | _ver quadro no topo_ |

## 5. Fases e controle

| Fase | Entrega | Situação |
|---|---|---|
| F1 | Mensagem agendada: **alterar**, e registro na **Agenda/Atendimentos** (Atividade ligada) | ✅ código (6f54c7e) · 📱 pendente |
| F2 | Atendimento agendado: ligação com a conversa, aviso na hora, abrir conversa | ✅ código (6f54c7e, afcb855) · 📱 pendente |
| F3 | Alterar/cancelar na própria conversa (listas dentro de *Agendar mensagem* e *Agendar atendimento*) | ✅ código · 📱 pendente |
| F4 | Notas: distinção visual e conferência de visibilidade por perfil | ⬜ |
| F5b | Testes de API (11 casos em `agendamentos-whatsapp.spec.ts`) | ✅ |
| F5 | Conferência em aparelho (fluxo completo, inclusive o aviso na hora marcada) | ⬜ |
| F6 | **Gerador de roteiro semanal de atendimentos** (ver seção 7) | ⬜ desenho |

## 6. Como ficou (F1–F3)

- **Mensagem agendada:** ao agendar, nasce uma Atividade (`automatica = true`) na agenda do vendedor dono do aparelho, ligada ao cliente e à conversa. Alterar texto e/ou hora acompanha a atividade; cancelar a tira da agenda; enviar a conclui. Só se altera enquanto `pendente`.
- **Atendimento agendado:** *Agendar atendimento* (antes "visita/retorno") ganhou a opção **Avisar no sino e abrir a conversa na hora marcada** (ligada por padrão, exige data/hora). A rotina de 1 min grava a notificação `atendimento_agendado`, com link `/comercial/atendimento?conversa=ID`. **Nada é enviado ao cliente.** Um aviso por atividade; mudar a hora zera o aviso para valer na nova hora.
- **Sem duplicar aviso:** a varredura de "atividade vence hoje" ignora atividade `automatica` e `iniciarConversa`.
- **Endpoints novos:** `PATCH conversas/:id/agendamentos/:agendamentoId`, `GET/PATCH/DELETE conversas/:id/atendimentos-agendados[/:atividadeId]`.
- **Migration:** `20261016130000_agendamentos_whatsapp` — **aplicada em dev; produção precisa de `migrate deploy` antes do deploy** (a API consulta as colunas novas).

## 7. F6 — Roteiro semanal de atendimentos (decidido em 2026-10-16)

> *"Gerar atendimento de WhatsApp, gravando na agenda do vendedor, atendimentos para a semana com intervalos parametrizáveis entre conversas, e critérios de escolha de clientes. Segunda 08:00 Cliente X, 08:30 Cliente Y, 09:00 Cliente W."*

### 7.1 O que foi decidido

| Tema | Decisão |
|---|---|
| Quem gera | **Cada vendedor** gera o próprio roteiro |
| Onde fica | **Dentro da Agenda** (botão "Gerar roteiro") |
| Período | Dias úteis dentro de um intervalo de datas informado nos parâmetros, **no máximo 15 dias** |
| Dias e horários | Só **dias úteis** (sem feriado) e **dias/horários de trabalho do cadastro do usuário**; almoço é o que o horário do usuário já deixa de fora |
| Intervalo entre conversas | **Digitado na geração** (varia a cada vez) |
| Horários | **Somente horários livres** da agenda do vendedor |
| Máximo por dia | **Sem teto** (o limite são os horários livres) |
| Critérios de clientes | (a) não compram há N dias; (b) título vencido; (c) compraram no mês passado e **ainda não neste mês**; (d) compraram **no mesmo período do mês passado** |
| Cliente sem conversa | Só entra quem **já tem vínculo** (criado pelo usuário) **ou pode ser gerado a partir do cadastro** (telefone). Os demais ficam fora, listados |
| Prévia | **Sim**: lista editável (tirar cliente, trocar horário) antes de gravar |
| Gerar de novo | **Só em horários vagos**; precisa **excluir agendamentos individualmente e em lote** |
| Avisos | Vendedor recebe o aviso; **supervisor/gerente** são avisados se o atendimento **passar do horário sem ser feito** e quando houver **cancelamento** |
| Motivo | **Obrigatório** ao cancelar, desmarcar ou remarcar |
| Confirmação | **Antes de iniciar os atendimentos do dia/período, o vendedor confirma**; se não for iniciar, desmarca/remarca (com motivo) |
| Mensagem de abertura | **Automática, com comportamento humano** ("Bom dia, tudo bem?" ou saudação semelhante), enviada pelo WhatsApp do vendedor — **muda a regra anterior** de "não enviar nada" |
| Nota automática | Cada conversa iniciada ganha uma **nota** com o **texto informado na geração** (visível a vendedor, supervisor e gerente; não vai ao cliente) |
| Finalizar | Conversa iniciada automaticamente precisa de uma forma de **finalizar**, registrando no **histórico de atendimento** |

### 7.2 Desenho

**Modelo.** `whatsapp_roteiros` (a geração: vendedor, período, intervalo, critérios, texto da nota) e `whatsapp_roteiro_itens` (um por cliente/horário: atividade da Agenda, conversa, `status`: agendado → confirmado → iniciado → finalizado, ou cancelado/remarcado, com motivo e datas). Cada item é também uma **Atividade** (aparece na Agenda e no histórico).

**Geração.** (1) *Prévia*: seleciona clientes da carteira pelos critérios, ordena por prioridade e distribui nos **horários livres** (horário de trabalho do usuário − atividades já marcadas − feriados), um por intervalo. (2) *Gravar*: cria roteiro, itens e atividades; cria a conversa (a partir do cadastro) quando não existe.

**Execução.**
1. **Confirmação do dia:** antes do primeiro atendimento do dia, aviso no sino com a escolha **Iniciar / Remarcar / Cancelar** (os dois últimos pedem motivo). **Sem confirmação, nada é enviado.**
2. **Na hora de cada item confirmado:** o sistema pede presença de digitação, espera um intervalo curto e variável, envia a saudação (de acordo com o horário) pelo WhatsApp do vendedor, grava a **nota** e avisa o vendedor com o link da conversa. WhatsApp desconectado → item vira "erro" visível, com aviso.
3. **Atraso:** item que passa do horário sem ser iniciado/feito avisa **supervisor e gerente** (uma vez).
4. **Finalizar:** ação na conversa registra o resultado, conclui a atividade e grava no histórico de atendimento.
5. **Cancelar / remarcar:** individual ou em lote, com **motivo obrigatório**; avisa supervisor/gerente.

### 7.3 Pontos assumidos (corrigir se não forem isso)

| # | Assumi | 
|---|---|
| A1 | "Mesmo período do mês passado" = comprou entre o mesmo dia inicial e final do intervalo, **no mês anterior**, e ainda não comprou no período atual |
| A2 | Como só há horários livres, a **prioridade** é: título vencido → não compra há mais tempo → não compraram neste mês → mesmo período do mês passado |
| A3 | Cada atendimento ocupa **um intervalo** inteiro (do horário até o próximo) para efeito de "horário livre" |
| A4 | Usuário **sem horário de trabalho cadastrado** informa o início e o fim do dia na geração (padrão 08:00–18:00) |
| A5 | A saudação é escolhida pelo horário (Bom dia / Boa tarde / Boa noite) numa lista curta; o texto livre da geração vai na **nota**, não na mensagem ao cliente |
| A6 | "Finalizar" pede um **resultado** (texto) e, opcionalmente, o próximo retorno |

### 7.4 Fases

| Fase | Entrega | Situação |
|---|---|---|
| F6.1 | Modelo de dados, contratos e **prévia** (clientes, critérios, horários livres) com testes | ⬜ |
| F6.2 | **Gravar** o roteiro; cancelar/remarcar individual e em lote com motivo e aviso à supervisão | ⬜ |
| F6.3 | **Confirmação do dia**, início automático (saudação + nota) e aviso de atraso | ⬜ |
| F6.4 | **Finalizar** atendimento e histórico | ⬜ |
| F6.5 | Tela na Agenda: gerar (parâmetros e prévia), lista do roteiro, seleção em lote | ⬜ |
| F6.6 | Conferência em aparelho e com um WhatsApp real | ⬜ |

## 8. Registro

| Data | O quê |
|---|---|
| 2026-10-16 | Levantamento do que existe e das lacunas; desenho e fases propostos. Nada implementado ainda. |
