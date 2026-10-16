# WhatsApp — agendamento de mensagens, notas e agendamento de atendimento

> Criado em 2026-10-16. **Documento vivo:** atualizar a cada decisão e a cada entrega.
> Pedido do usuário: nas telas de conversa por WhatsApp, três recursos —
> (1) **agendar envio de mensagem**; (2) **notas** que ficam na conversa, só na plataforma, visíveis a usuário,
> supervisor e gerente; (3) **agendamento de atendimento** que gera anotação na agenda e, na data e hora marcadas,
> avisa o vendedor na plataforma e inicia uma conversa por WhatsApp.
> Todos os agendamentos se registram em **Atendimentos** e **Agenda**, e podem ser **alterados ou cancelados antes do envio**.

## ⚠ Perguntas em aberto — responder aqui

Preencha a coluna **Resposta** (ou me diga no chat que eu preencho). As propostas são minhas; basta concordar ou corrigir.

| # | Pergunta | Proposta | Resposta |
|---|----------|----------|----------|
| D3 | Quem recebe o aviso? | O vendedor dono da conversa; supervisor/gerente só enxergam na agenda | _assumido, não confirmado_ |
| R1 | Quem gera? | O vendedor para si; supervisor/gerente para a equipe (dentro do escopo) | _pendente_ |
| R2 | Critérios de escolha dos clientes | Dias sem comprar, título vencido, positivação do mês, carteira/segmento, sem atendimento há N dias, ordenação e limite (N clientes por dia) | _pendente_ |
| R3 | Parâmetros do roteiro | Dias da semana, horário inicial e final de cada dia, **intervalo entre conversas** (ex.: 30 min), pausa de almoço, respeitar feriados | _pendente_ |
| R4 | Cliente sem conversa de WhatsApp ainda | Cria a conversa (precisa de telefone/contato); sem contato, fica fora e aparece como "não agendado" | _pendente_ |
| R5 | Prévia antes de gravar | Sim: lista editável (tirar cliente, mudar horário) e só então **Gerar** | _pendente_ |
| R6 | Onde fica a tela | Em Comercial › Atendimento (botão "Roteiro da semana") ou rotina própria | _pendente_ |
| R7 | Regerar a mesma semana | Substituir ou acrescentar? Proposta: oferecer cancelar o roteiro anterior ainda não iniciado | _pendente_ |

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

## 7. F6 — Gerador de roteiro semanal (pedido em 2026-10-16)

> *"Gerar atendimento de WhatsApp, gravando na agenda do vendedor, atendimentos para a semana com intervalos parametrizáveis entre conversas, e critérios de escolha de clientes. Segunda 08:00 Cliente X, Segunda 08:30 Cliente Y, Segunda 09:00 Cliente W."*

É a F2 em lote: cada linha do roteiro é um **atendimento agendado** (Atividade com `iniciarConversa`), e o que se agendou vale o aviso na hora e abrir a conversa. Falta decidir:

As perguntas desta fase (R1 a R7) estão no quadro **"Perguntas em aberto"**, no topo deste documento.


## 8. Registro

| Data | O quê |
|---|---|
| 2026-10-16 | Levantamento do que existe e das lacunas; desenho e fases propostos. Nada implementado ainda. |
