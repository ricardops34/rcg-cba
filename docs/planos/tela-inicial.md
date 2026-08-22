# Tela inicial (Início)

O que o usuário vê ao entrar no sistema: acessos rápidos, aniversariantes da
equipe e o mural de comunicados internos.

A rota `/` já era a tela pós-login, mas só listava Empresas, Usuários e
Perfis: um vendedor entrava e não via nada útil. Passou a ter três blocos.

**Acessos rápidos.** Lista curada de 12 telas do dia a dia, filtrada pela
permissão de cada uma, cortada nos 8 primeiros. Curada e não gerada do menu:
o menu lateral já lista tudo, e a graça aqui é a ordem do trabalho — quem
atendo, o que vendo, o que preciso cobrar.

**Aniversariantes.** Vendedores da empresa com aniversário nos próximos 30
dias. **Sem escopo hierárquico, e a diferença é deliberada:** por
`resolverEscopoVendedores` um vendedor de carteira enxerga só a si mesmo, e a
seção mostraria o próprio aniversário e mais nada. A API devolve nome, dia e
mês — **nunca o ano**.

**Comunicados.** Cadastro novo (tabela `comunicados` + `comunicado_perfis`,
migration `20260821171457`, as duas com RLS), administrado em
`/admin/comunicados`. Título, texto, período de exibição, "fixar no topo" e
destino por perfil — **lista de perfis vazia = todos**, inclusive perfil criado
depois; exigir marcar todos faria o cadastro errar por omissão.

Decisões que valem registrar:

- **Ler o mural não exige permissão**, só login. `comunicados.*` controla
  *administrar* o cadastro. Um aviso que só quem publica pudesse ler não
  avisaria ninguém.
- **A rotina foi criada por migration (`20260821172123`), não pelo seed.**
  `seed-base.ts` **apaga todos os dados de negócio** antes de repovoar — rodá-lo
  na base de dev destruiria a importação. O seed também foi atualizado, para
  quem cria a base do zero. Só o perfil Administrador recebe as quatro ações.
- Comunicado **não é notificação**: sem destinatário individual, sem "lido",
  não some quando alguém abre. Por isso tabela própria, e não `notificacoes`.

**Uma armadilha encontrada testando** (e que não aparece em build): o filtro
`vinculo: { not: 'sistema' }` do serviço de aniversariantes **descartava todo
mundo**. `vinculo` é nulo nos 73 vendedores da base (o import do ERP não traz),
e em SQL `NULL <> 'sistema'` não é verdadeiro. Corrigido com
`OR: [{ vinculo: null }, { vinculo: { not: 'sistema' } }]`.

Verificado ponta a ponta com login real (admin): mural vazio → publica →
aparece; endereçado a um perfil que não é o do usuário → some. Aniversariantes
testado com quatro vendedores temporários (hoje, +5 dias, +40 dias, desligado):
voltaram os dois certos, com `emDias` 0 e 5. **Os dados de teste foram
apagados.**

**Nenhuma data de nascimento está preenchida na base** — nem em clientes (a
base legada no MySQL não tem o campo em nenhum dos 6.626), nem em vendedores.
A seção fica vazia até alguém preencher no cadastro de Vendedores.


---

## Lista de contatos recolhida ao entrar com a conversa escolhida (2026-08-21)

Pedido: vindo da Posição de Cliente para o Atendimento, a lista de contatos
deve começar recolhida.

O sinal usado é a **conversa na URL** (`?conversa=<id>`), não a tela de origem:
quem chega assim já sabe com quem vai falar. Cobre o "Atendimento" do menu da
Posição de Cliente e também o link do sino de notificações — a mesma situação.

Vale só para aquela entrada e **não grava no `localStorage`**: a preferência de
quem abre a tela pelo menu continua valendo. Só a primeira renderização conta,
senão trocar de conversa pela própria lista a faria recolher no meio do uso.
Clicar no botão de mostrar conversas desfaz o recolhimento na hora.
