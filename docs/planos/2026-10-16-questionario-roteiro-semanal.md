# Questionário — Roteiro semanal de atendimentos por WhatsApp

**Como responder:** troque `[ ]` por `[x]` na opção que você quer. Pode marcar mais de uma onde estiver escrito *"marque quantas quiser"*. Se nenhuma opção servir, escreva na linha **Outra**. Não precisa responder tudo de uma vez — o que ficar em branco eu pergunto depois.

**O que estamos decidindo:** uma função que monta, de uma vez, os atendimentos da semana na agenda do vendedor. Exemplo:

> Segunda 08:00 — Cliente X · Segunda 08:30 — Cliente Y · Segunda 09:00 — Cliente W

Na hora marcada, o vendedor recebe um aviso na plataforma e a conversa de WhatsApp com aquele cliente abre pronta. **Nada é enviado ao cliente sozinho** — quem escreve é o vendedor.

---

## 1. Quem monta o roteiro?

- [x] **Cada vendedor monta o seu próprio roteiro**
- [ ] **Supervisor e gerente também montam** — para a equipe deles, escolhendo o vendedor
- [ ] **Só supervisor e gerente montam** — o vendedor apenas recebe o roteiro pronto
- Outra: ______________________________

## 2. Quais clientes entram no roteiro? (marque quantas quiser)

- [X] Clientes que **não compram há** ____ dias
- [X] Clientes com **título vencido** (cobrança)
- [X] Clientes que compraram no mês passado e **ainda não compraram neste mês**
- [ ] Clientes que **não foram atendidos pelo WhatsApp há** ____ dias
- [ ] Clientes de uma **cidade ou região** específica
- [ ] Clientes de um **ramo / categoria** específico
- [ ] O vendedor **escolhe a dedo**, cliente por cliente
- Outro critério: Compraram no mesmo periodo do mes passado

**Quando houver mais clientes do que horários, quem vem primeiro?** (marque uma)

- [ ] Quem está **há mais tempo sem comprar**
- [ ] Quem tem **maior valor de compras** no último ano
- [ ] Quem tem **título vencido há mais tempo**
- [ ] Ordem alfabética
- Outra: So vamos gerar atendimentos para horarios livres

**Máximo de atendimentos por dia:** ______ (ex.: 12)

## 3. Horários e intervalos

**Quais dias da semana?** (marque quantas quiser)

- Dias uteis do intervalo informando nos parametros. Não superior a 15 dias.

**Horário do primeiro atendimento do dia:** ______ (ex.: 08:00)
**Horário limite do último atendimento do dia:** ______ (ex.: 17:00)

**Intervalo entre uma conversa e a próxima:** (marque uma)

- [ ] 15 minutos  [ ] 30 minutos  [ ] 45 minutos  [ ] 1 hora
- [x] Quem monta o roteiro digita o intervalo na hora (cada vez pode ser diferente)

**Pausa de almoço** (nenhum atendimento nesse período)?

- [ ] Não tem
- [ ] Das ______ às ______
- [X] No cadatro do usuario temos horario de trabalho

**Feriados:**

- [X] Somentes dias uteis e em dias que o suario tem horario de trabalho
- [ ] Marcar normalmente

## 4. Cliente que ainda não tem conversa de WhatsApp

Alguns clientes nunca conversaram com o vendedor pelo WhatsApp. O que fazer? (marque uma)

- [ ] **Criar a conversa** automaticamente quando o cliente tiver telefone cadastrado
- [ ] **Deixar de fora** e me mostrar uma lista dos que não entraram, para eu resolver
- Outra: So temos como iniciar conversas para cliente com vinculo criado pelo usuario ou gerado com base no cadastro.

## 5. Revisar antes de gravar

- [x] **Mostrar a lista pronta para eu revisar** antes de gravar — posso tirar um cliente, trocar o horário ou trocar a ordem, e só então confirmar *(recomendado)*
- [ ] Gravar direto, sem revisão (eu ajusto depois na agenda)

## 6. Onde fica essa função?

- [ ] Um botão **"Roteiro da semana"** dentro da tela de atendimento (conversas)
- [ ] Uma **tela própria** no menu (ex.: Comercial › Roteiro da semana)
- [x] Dentro da **Agenda**
- Outra: ______________________________

## 7. E se eu gerar o roteiro de novo para a mesma semana?

- [ ] **Perguntar:** cancelar os atendimentos do roteiro anterior que ainda não aconteceram, ou manter os dois
- [ ] **Sempre substituir** o roteiro anterior (só o que ainda não aconteceu)
- [ ] **Sempre acrescentar** ao que já existe
- Outra: Somente em horarios vagos, precisamos a opção de excluir agendamentos individualmente e em lote. 

## 8. Quem recebe o aviso na hora do atendimento?

*(Vale tanto para o atendimento agendado um a um quanto para o roteiro.)*

- [X] **Só o vendedor** dono da conversa
- [ ] O vendedor **e o supervisor dele**
- [ ] O vendedor, o supervisor **e o gerente**
- [x] Só o vendedor, mas o supervisor/gerente é avisado **se o atendimento passar do horário sem ser feito**
- Outra: Avisar supervisor/gerente quando cancelar agendamentos

---

## Observações livres

Algo que não perguntei, uma regra do dia a dia da equipe, um exemplo real de como vocês trabalham hoje:

Antes de iniciar os atendimentos do dia\periodo confirmamos com o vendedor. Se vamos iniciar o desmarca/remarcar. Quando cancelar agendamentos ou desmarcar/remarcar tem que informar o motivo

A mensagens de inicio de conversa, são automaticas, mais com coportamento humano, com um "Bom dia, tudo bem?" ou uma Saldação semelhante, esta mensagem automatica, vai ter uma nota gerada altomaticamente, com o texto informado na geração.

Para estas conversas iniciadas automaticamente, precisamos de uma forma de finalizar, para registrar no historico de atendimento,

---

*Quando terminar, é só me avisar aqui no chat ("respondi o questionário"). Eu leio o arquivo, registro as decisões no plano
[2026-10-16-agendamentos-whatsapp.md](2026-10-16-agendamentos-whatsapp.md) e começo a implementar.*
