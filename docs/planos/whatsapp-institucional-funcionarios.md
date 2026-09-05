# Institucional atendendo funcionários — plano

> Registrado em 2026-09-04. As seis decisões da seção "Decisões" são do usuário
> e já estão fechadas. Continua o plano do atendimento institucional que hoje só
> conhece cliente (`docs/planos/whatsapp-vendedor.md`, seção da triagem).

## O que muda

Hoje o número institucional atende **uma** figura: o cliente. Quem escreve é
identificado pelo vínculo `whatsapp_contatos.clienteId`, e a triagem oferece as
ferramentas de `triagem-ferramentas.ts` conforme haja ou não cliente associado.

O pedido é atender também **vendedor, gerente e supervisor**, com ferramentas
próprias, e poder mandar/agendar mensagem para esses grupos.

## O buraco que precisa ser tapado antes (Fatia 0)

**Hoje a triagem não roda em lugar nenhum.** Os quatro campos `atendimento*` de
`whatsapp_config` foram criados pela migration `20260904020000_whatsapp_empresa_ia`
e não têm caminho de escrita: não estão no `whatsappConfigUpdateSchema`, não
passam pelo `PUT /whatsapp/config` e não existem em tela. `atendimentoIaAtivo`
nasce `false` e ninguém consegue ligá-lo pelo produto.

Consequência: toda mensagem ao institucional cai em "Atendimento automático
desligado" e vai para a fila. As sete ferramentas da triagem nunca executam —
não por estarem erradas, mas porque o bot nunca entra.

Dois campos são letra morta além disso: `atendimentoSaudacao` não é lido por
ninguém, e `atendimentoInatividadeMin` não tem a varredura que encerraria a
conversa parada em `bot` — o limbo que o próprio comentário do schema descreve.

## Decisões (do usuário, 2026-09-04)

1. **Identidade do funcionário: telefone cadastrado + código na 1ª vez.** Antes
   de liberar ferramenta, a pessoa confirma um código que só aparece **dentro do
   sistema**, onde ela entrou com senha. Posse do celular sozinha não basta; o
   número vira credencial deliberada. Revalida periodicamente.

   **O telefone é o do cadastro de vendedores** (`vendedores.telefone`) —
   correção do usuário em 2026-09-04. Vendedor, gerente e supervisor têm
   cadastro ali.

   Isto revelou um defeito silencioso: o `avisar_equipe` lia de
   `usuario_empresas.celular/telefone`, colunas que **ninguém preenche** (0 de
   10 vínculos na base de dev, contra 9 de 10 vendedores com telefone). Todo
   destinatário era pulado por número curto, e a ferramenta devolvia "ninguém
   tem celular cadastrado com WhatsApp" — a IA acreditava e o aviso nunca saía.
   Corrigido junto, na mesma fonte.

2. **Poder do funcionário: só consulta.** Nada é criado nem alterado pelo
   WhatsApp. É o que dá valor sem transformar um celular perdido em acesso de
   escrita — e evita a parede que o código já recusou atravessar uma vez (o
   comentário da 2ª via de boleto em `triagem-ferramentas.ts`).

3. **Gerente e supervisor são o mesmo grupo.** `Vendedor.tipo` só distingue
   `vendedor` de `superior`, e inventar a diferença amarraria o atendimento ao
   nome de um perfil. Quem tem gente abaixo enxerga a equipe; quem não tem, a
   própria carteira — exatamente o que `resolverEscopoVendedores` já decide.

4. **Disparo para grupo: pela tela, com a IA só redigindo.** Escolhe o grupo,
   vê quantos recebem, revisa e agenda. A IA ajuda a escrever; o disparo é um
   botão que alguém aperta vendo a lista. Errar por WhatsApp não tem desfazer.

5. **Não há envio em massa.** O usuário corrigiu a premissa: isto não existe no
   negócio. Some do plano a discussão de opt-out, teto e intervalo.

6. **O disparo alcança só grupos internos.** Vendedores, gerentes e
   supervisores. Cliente continua recebendo apenas na conversa individual, como
   hoje.

## Desenho

### Quem está falando

A triagem passa a resolver a identidade em duas etapas, nesta ordem:

1. O telefone bate com o de um vendedor ativo (`vendedores.telefone`)? →
   candidato a **funcionário**.
2. Senão, o caminho de hoje: contato → `clienteId` → **cliente**, ou
   desconhecido.

A comparação é pelos **últimos 8 dígitos**, a convenção que `casarCliente` já
usa: cobre com/sem DDI 55 e com/sem o 9º dígito sem normalizar a base inteira.
Dois vendedores com o mesmo sufixo **não** resolvem para nenhum — ambiguidade
não adivinha, aqui menos ainda do que no cadastro de cliente.

Funcionário e cliente não se misturam: quem é reconhecido como funcionário não
recebe as ferramentas de cliente, e vice-versa. Um número que sirva às duas
coisas (o dono da empresa que também é cliente) resolve como funcionário — é o
vínculo mais forte, e o que ele consegue ver por ali é sempre recortado pelo
escopo dele.

### O pareamento

Tabela nova `whatsapp_vinculos_funcionario` (com RLS, tem `empresaId`):

- Mensagem de um número reconhecido e ainda não confirmado → gera código de 6
  dígitos, com validade curta, e a triagem responde pedindo que a pessoa o leia
  no sistema. **Nenhuma ferramenta é oferecida** enquanto isso.
- O código aparece em **Meu perfil**, para o próprio usuário logado. É isso que
  faz a posse do celular não bastar.
- Respondido corretamente, o vínculo vale por um prazo; vencido, pede de novo.
- Erro de código tem teto de tentativas: estourado, o código morre e é preciso
  gerar outro escrevendo de novo.

### Escopo sem usuário autenticado

`resolverEscopoVendedores` recebe hoje um `AuthenticatedUser`, mas só lê
`user.isAdmin` e `user.id`. A função é dividida: o miolo passa a receber
`{ usuarioId, isAdmin }`, e a assinatura atual vira um invólucro. Assim o
funcionário no WhatsApp usa **a mesma** regra de escopo do sistema, sem que
ninguém precise fabricar um usuário sintético.

### Ferramentas do funcionário

Só leitura, sempre recortadas pelo escopo resolvido acima — nenhuma recebe
"de quem" como argumento, pela mesma razão das ferramentas de cliente: se o
modelo pudesse informar de quem quer os números, bastaria convencê-lo.

### Recado interno (Fatia 3)

Tela de envio/agendamento para grupo interno. O grupo é derivado do cadastro
(toda a equipe abaixo de quem envia, ou seleção nominal), o destino é o
`celular/telefone` do vínculo, e o transporte é a sessão institucional — o
mesmo caminho que `avisar_equipe` já percorre.

## Ordem de implementação

Cada passo é utilizável sozinho:

0. **Config do atendimento na tela** — os quatro campos `atendimento*` no
   contrato, na rota e em Administração > WhatsApp. Sem isto nada do
   institucional liga.
1. **Saudação e encerramento por inatividade** — usar os dois campos que hoje
   são letra morta.
2. **Identidade e pareamento do funcionário** — tabela, código, Meu perfil.
3. **Ferramentas do funcionário** — catálogo e execução, escopo compartilhado.
4. **Recado interno pela tela**, com agendamento.
