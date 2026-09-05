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

Todas as fatias abaixo estão **implementadas** (2026-09-04/05). Cada uma é
utilizável sozinha, e foi assim que entraram.

0. **Config do atendimento na tela** — os quatro campos `atendimento*` no
   contrato, na rota e numa aba própria em Administração > WhatsApp. Sem isto
   nada do institucional ligava.
1. **Saudação e encerramento por inatividade** — os dois campos que eram letra
   morta. Encerrar exigiu implementar a volta: o status `encerrada` existia no
   enum e não era usado por ninguém, então mensagem nova do cliente agora
   reabre a conversa.
2. **Identidade e pareamento do funcionário** — tabela, código de 6 dígitos e
   o cartão em Meu perfil, o único lugar onde o código aparece.
3. **Ferramentas do funcionário** — catálogo de consulta e execução, com o
   escopo vindo de `resolverEscopoDoUsuario`. São oito: títulos vencidos,
   agenda, situação de cliente, fila de espera, acompanhamento de objetivos
   (equipe ou individual), resumo de atividades, aniversariantes (clientes ou
   equipe) e clientes sem compra no mês com sugestão do que oferecer.

   **O realizado sai de `ITEM_DE_VENDA_WHERE`**, a mesma regra do Dashboard,
   dos Objetivos e das Consultas — conferido contra `GET /objetivos/dashboard`
   em 09/2026 para um supervisor: R$ 100.923,00 de meta e R$ 80.836,23
   realizados nos dois lados, ao centavo. Reimplementar "o que conta como
   venda" daria um segundo número para a mesma pergunta.

   **`clientes.ultimaCompra` não é usada, e não deve ser.** A coluna existe mas
   não é mantida: nesta base, 83 de 83 clientes têm nota e **nenhum** tem o
   campo preenchido (só `primeiraCompra`). A última compra é derivada de
   `notaSaidaItem.dtEmissao`, como `ClientesService` e o agente interno já
   fazem. Vale conferir se o import do legado e a API de integração deveriam
   estar mantendo essa coluna — se alguma tela ainda a lê, mostra "sem compra".
4. **Recado interno pela tela**, com agendamento e cancelamento. Rotina própria
   `whatsapp-recados`, concedida a Administrador, Diretor, Gerente e Supervisor
   — **não ao Vendedor**: o alcance é a hierarquia abaixo de quem envia, e quem
   não tem ninguém abaixo só mandaria recado para si mesmo.

## Documentos do cliente (2026-09-05)

O cliente com número vinculado pede pela conversa: **2ª via de boleto**,
**cópia da nota** (DANFE) e **cópia de pedido** (PDF do orçamento), além das
listas que já existiam — últimas notas, títulos em aberto e agora os pedidos.
A transferência para o vendedor já existia.

A ressalva que estava escrita em `triagem-ferramentas.ts` foi resolvida, não
contornada: o bot **não** fabrica um `AuthenticatedUser` sintético. `QuemPede`
(`common/escopo/quem-pede.ts`) nomeia os dois solicitantes — usuário logado, que
alcança a carteira dele, e cliente, que alcança o que é dele — e os três
geradores passaram a receber esse recorte. Um gerador, dois recortes: as regras
do documento (título pago, janela de 30 dias, encargos do vencido, XML ausente)
ficam num caminho só, e não em duas cópias que divergem na primeira mudança.

Duas travas em série, e a segunda é a que o modelo não atravessa:

1. O modelo nunca vê id interno — ele pede pelo **número** que a listagem
   devolveu, e a resolução número → id já é recortada pelo cliente da conversa.
2. O próprio gerador recorta de novo, por cliente.

Verificado em dev: o cliente dono gera o boleto dele (PDF de 25 KB); outro
cliente pedindo o mesmo título recebe "Título não encontrado", e o mesmo vale
para a nota. As três rotas de usuário (boleto, DANFE, PDF de orçamento) seguem
em 200.

## Garantias de segurança (auditoria de 2026-09-05)

Cinco invariantes pedidos pelo usuário, e onde cada um é imposto. **Regra geral:
acesso é código; comportamento é prompt.** Instrução de prompt não é barreira —
descreve o comportamento desejado a um modelo que quem está do outro lado pode
tentar levar a outro.

| Garantia | Onde vive |
|---|---|
| Ninguém alcança dado de outra pessoa | Código: `QuemPede` recorta o gerador por cliente; escopo por carteira em toda consulta |
| Número não associado não alcança dado nenhum | Código: catálogo fail-closed (`ferramentasDaTriagem`) |
| Vendedor não alcança dado de outro vendedor | Código: `resolverEscopoDoUsuario`, a mesma função do sistema |
| Vendedor desligado não alcança nada | Código: `identificar` exige `usuarios.ativo` **e** `usuario_empresas.ativo` |
| Concorrente que descobre o número não alcança dado | Código: as quatro acima, mais o que foi fechado abaixo |

### A falha que a auditoria encontrou

**O pareamento do funcionário estava chaveado pelos últimos 8 dígitos** do
telefone. Dois números de DDDs diferentes com os mesmos 8 dígitos finais —
(67) 99724-1935 e (11) 99724-1935 — caíam no **mesmo** vínculo. Confirmado o
código pelo vendedor legítimo, o outro número herdava a confirmação e entrava
como funcionário, com a carteira dele. Escalação de privilégio, não teoria.

Corrigido em `20260905120000_vinculo_funcionario_chave_exata`: a chave passou a
ser DDD + 8 dígitos (`chaveTelefone`), que identifica o aparelho de forma exata
sem quebrar com os formatos que o WhatsApp entrega. O sufixo continua sendo
usado para **encontrar** a pessoa no cadastro, onde a tolerância é desejável —
encontrar não autoriza nada, só abre um pedido de código. Os pareamentos
existentes foram descartados, não convertidos: converter manteria confirmações
possivelmente concedidas ao número errado.

Reproduzido em dev antes e depois: os dois números geram vínculos separados, e
o atacante continua não confirmado mesmo digitando o código do vendedor.

### O que mais foi fechado

- **`identificar_cliente` não devolve mais nome nenhum.** Devolvia a razão
  social e o nome do vendedor a qualquer número — um concorrente com uma lista
  de CNPJs mapearia a carteira inteira de fora, um CNPJ por vez. Agora devolve
  só um `vendedorId` opaco, que serve para encaminhar: o modelo não vaza um nome
  que não recebeu.
- **`procurar_vendedor` saiu do catálogo geral** para o do cliente. Ali qualquer
  número sondava a equipe de vendas pelo nome. Para quem não é cliente,
  direcionar sem nome continua funcionando.
- **Os nomes de quem está de plantão** só entram no prompt quando quem escreve
  já é cliente. Para um desconhecido, era a escala da equipe entregue a quem só
  precisou descobrir o número.
- **Fail-closed no escopo do funcionário**: `null` significa "sem restrição" no
  resto do sistema, e ali faz sentido (Administrativo, numa tela atrás de
  senha). Aqui seria o contrário do que se quer — se o escopo não resolve, não
  se atende.
- **O bot não pede credencial** (`sem-credencial.ts`), e isso deixou de ser só
  instrução de prompt. A checagem é por frase, para "nunca pedimos sua senha"
  continuar podendo ser dito e o código de pareamento não ser bloqueado junto.
  Bloqueado, o atendimento vai para uma pessoa: insistir daria ao atacante uma
  segunda tentativa.

### Limitações conhecidas

- Um número que **compartilhe os 8 dígitos finais** com um vendedor recebe "Oi,
  \<primeiro nome\>! Reconheci este número como seu" antes de pedir o código.
  Vaza um primeiro nome a quem já precisou controlar um número quase igual ao
  do vendedor. Não vaza mais que isso, e o pareamento não avança.
- **O texto da conversa vai ao provedor de IA** — decisão registrada em
  2026-08-25. A fronteira `anonimizar-agente.ts` mascara por nome de campo e não
  lê texto livre: o que o cliente digitar sai sem máscara.
- Se o cliente **enviar** uma senha por conta própria, ela é gravada e vai ao
  provedor. O bloqueio impede pedir, não impede receber.

## O que ainda não foi observado em execução

Dev não tem agente de IA configurado nem worker de WhatsApp conectado. Foram
exercitados o reconhecimento, o pareamento, os escopos, o agendamento e todos
os caminhos de falha — mas **a conversa real com o modelo e o envio efetivo**
não. O que falta ver com um número conectado:

- a IA respondendo ao funcionário e chamando as quatro consultas;
- a saudação chegando ao cliente;
- o recado interno saindo de fato para os celulares da equipe.
