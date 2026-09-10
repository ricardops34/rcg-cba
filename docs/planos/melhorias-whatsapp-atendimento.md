# Melhorias em WhatsApp e atendimento — plano

> Registrado em 2026-09-10, a partir de uma comparação com o DeskcommCRM
> (referência externa open source) nas áreas de agentAI e atendimento
> WhatsApp, mais um gap próprio identificado na mesma conversa. **Ainda não
> implementado** — nenhum item deste plano tem código escrito.

## O que motivou

Ao comparar nosso sistema com o DeskcommCRM (Next.js + Supabase + WAHA/Cloud
API), duas coisas ficaram claras:

1. Temos paridade em RAG/embeddings (pgvector para fichas de produto) e na
   abstração de "ferramentas" do agente (três famílias documentadas em
   [`docs/ferramentas/`](../ferramentas/README.md)) — não é gap.
2. Faltam proteções operacionais concretas no envio de WhatsApp que o
   DeskcommCRM já tem: anti-banimento no canal não oficial, opt-out
   automático e reconexão de sessão sem depender de um humano notar a queda.

Separadamente, ao discutir a timeline de atendimento (o equivalente à aba
"Atividade" deles, que é log de execução de automação — coisa diferente),
achamos que **não existe hoje** uma tela onde um gerente escolha vendedor **e**
cliente juntos e veja o histórico combinado (atividade + WhatsApp + documento
+ orçamento).

## O que já existe (e onde cada correção se apoia)

Cada item abaixo tem um ponto único no código por onde toda a lógica
equivalente já passa — a correção entra ali, sem duplicar em cada chamador:

- **Envio de mensagem (canal não oficial)**: `EvolutionGoClient.chamar`
  (`apps/api/src/modules/whatsapp/providers/evolution-go.client.ts:54-91`) é
  o único ponto por onde toda chamada HTTP ao Evolution GO passa — texto e
  mídia, recado e agendamento.
- **Filtro de vendedor por escopo**: `combinarFiltroVendedor` em
  `apps/api/src/common/escopo/escopo-vendedores.ts:97-103` já existe e faz
  exatamente "restringe a um vendedor específico dentro do que este usuário
  alcança" — só não é usada em `meus-atendimentos.service.ts` ainda.
- **Recebimento de mensagem (os dois canais)**: `WhatsappConversasService.receber`
  (`apps/api/src/modules/whatsapp/whatsapp-conversas.service.ts:1988`) é o
  ponto de convergência — Evolution e Cloud API chegam os dois aqui antes de
  gravar.
- **Envio de mensagem (os dois canais)**: `WhatsappProviderService.enviarTexto`/
  `enviarArquivo` (`providers/whatsapp-provider.service.ts:303-329`) é o funil
  por onde `WhatsappRecadoService` e `WhatsappAgendamentoService` já passam.
- **Estado da sessão**: `WhatsappSessaoService.registrarEstado`
  (`whatsapp-sessao.service.ts:473`) é o ponto único de gravação — toda
  mudança de conexão passa por ali antes de virar linha no banco.

## Fase 1 — baixo esforço, sem migration nova

### 1.1 Anti-banimento no envio (canal não oficial)
`WhatsappRecadoService.despachar` (linha 349-379) e
`WhatsappAgendamentoService.processarEmpresa → enviarUma` (linha 171-255)
disparam mensagens em loop, sem atraso nenhum entre uma e outra — o padrão
que a Meta identifica como spam. Corrige em `EvolutionGoClient.chamar`: um
atraso aleatório (throttle + jitter) antes de cada chamada HTTP, configurável
por parâmetro de empresa (mesmo padrão de `ParametrosService.obterNumero` já
usado em Sugestão de Compra). Não mexe no canal oficial — Cloud API não tem
esse risco.

> **Enriquecido a partir do DeskcommCRM** (`components/connections/AntiBanSheet.tsx`):
> o deles não é só throttle+jitter uniforme — é **aquecimento progressivo por
> idade do número**. Número recém-conectado (`numeroEmUsoDesde` mais recente)
> começa com teto diário baixo que escala com os dias de uso; um switch
> "pular aquecimento" existe para número que já era usado ativamente antes de
> entrar no sistema (não deveria começar do zero). Mais: janela de
> horário com fuso (mensagem fora da janela fica agendada, não descartada,
> com justificativa visível) e um toggle separado para domingo (prospecção
> não incomoda fim de semana). Vale desenhar `1.1` já com esse modelo —
> `dataEmUso` + tabela de teto por dia de idade — em vez de um throttle único
> para todo número, que protege mal o cenário de maior risco (número novo).

### 1.2 Filtro de vendedor em `meus-atendimentos`
Hoje só existe "própria carteira" ou "equipe inteira" (`meus-atendimentos.service.ts:68-81`,
filtro montado à mão). Trocar pelo `combinarFiltroVendedor` já existente,
aceitando um `vendedorId?` opcional no `MeusAtendimentosQuery`
(`packages/contracts/src/meus-atendimentos.ts`) — reaproveita 100% da lógica
multi-fonte (atividade + WhatsApp + documento + orçamento) que já existe, só
amplia o filtro. No front (`comercial/meus-atendimentos/page.tsx`), troca o
toggle "própria/equipe" por um combobox de vendedor quando `podeVerEquipe`,
reaproveitando `useVendedoresEscopo` (já usado em Sugestão de Compra e
Posição de Cliente).

### 1.3 Filtro de cliente em `/crm/atividades`
A API `GET /atividades` já aceita `clienteId` junto com `vendedorId`
(`atividades.service.ts:118-159`); a tela não expõe esse filtro. Só
front-end: `ClienteCombobox` ao lado do filtro de vendedor já existente
(`crm/atividades/page.tsx:208-231`).

## Fase 2 — proteção de compliance e operação

### 2.1 Opt-out / STOP automático
Não existe em lugar nenhum hoje — cliente que manda "PARAR"/"SAIR" continua
recebendo agendamento e recado. `WhatsappContato` já tem um campo `ignorado`
(`schema.prisma:3663-3688`), mas só esconde da lista — nunca bloqueia envio.
Plano: detectar a palavra-chave em `WhatsappConversasService.receber` (antes
do `upsert`, linha 2175), marcar `ignorado` (ou um novo `optOutEm DateTime?`
ao lado, para registrar quando), e checar isso dentro de
`WhatsappProviderService.enviarTexto`/`enviarArquivo` — cobre recado e
agendamento de uma vez, sem duplicar a checagem em cada chamador.

### 2.2 Reconexão automática + alerta (canal não oficial)
Sessão cai e fica em `desconectada` até um humano entrar na tela —
`reconectarAdministracao` (`whatsapp-sessao.service.ts:590`) é 100% manual
hoje. Plano: estender `registrarEstado` para, ao gravar `desconectada`,
agendar N tentativas de reconexão com backoff (reaproveitando a lógica que
`reconectarAdministracao` já tem) e, se todas falharem, notificar
gerente/supervisor pelo mesmo mecanismo de sino já usado em `registrar_lead`
(ver [`docs/ferramentas/whatsapp-cliente.md`](../ferramentas/whatsapp-cliente.md)).

> **Ideia barata trazida do DeskcommCRM** (`components/connections/ConnectionHealthDot.tsx`):
> um indicador simples — bolinha verde/amarela/vermelha/cinza — perto do
> ícone de Atendimento na topbar/sidebar, consultando o estado da sessão a
> cada ~30s (reaproveita o mesmo `registrarEstado`) e piscando quando cai.
> Não depende da reconexão automática estar pronta — dá pra entregar sozinho,
> antes ou junto de 2.2, e já resolve boa parte do "ninguém percebeu que
> caiu" enquanto o resto não está implementado.

## Backlog — decisão de produto, não entra sem validar antes

- **Storage de mídia com URL assinada por empresa** — hoje é disco local +
  nome UUID; o próprio `common/uploads/uploads.config.ts:12-14` já registra
  isso como pendência de produção.
- **Fila de eventos centralizada** (`event_log` + workers) para substituir os
  `setInterval` espalhados (`whatsapp-recado`, `whatsapp-agendamento`,
  `whatsapp-inatividade`, `erros-varredura`, `notificacoes-varredura`) — troca
  algo que já funciona por algo mais observável; vale mais quando o número de
  pollers crescer.
- **Follow-up adaptativo por etapa do funil** ("radar" de conversa esfriando,
  como no DeskcommCRM) — não existe nenhum scheduler (`@nestjs/schedule`) no
  projeto hoje; é feature de produto nova, não correção.
- **Memória organizacional** (conversa resolvida vira conhecimento reutilizável
  pelo agente) — a peça mais incerta; exigiria pipeline de avaliação, não só
  armazenamento.

## Verificação

- **1.1**: enviar recado/agendamento para 3+ destinatários em dev e conferir
  no log um atraso variável entre as chamadas HTTP ao Evolution GO.
- **1.2 / 1.3**: como gerente/supervisor, escolher um vendedor específico
  (não "equipe") e ver o timeline dele; escolher cliente + vendedor juntos em
  `/crm/atividades`.
- **2.1**: mandar "PARAR" de um número de teste e confirmar que um novo
  agendamento/recado para aquele número não é enviado.
- **2.2**: derrubar a sessão de teste (desconectar no celular) e observar as
  tentativas automáticas no log e, se esgotarem, a notificação ao gerente.

Nenhum item da Fase 1 ou 2 precisa de migration nova, exceto o opt-out (2.1),
que só acrescenta uma coluna a uma tabela existente.
