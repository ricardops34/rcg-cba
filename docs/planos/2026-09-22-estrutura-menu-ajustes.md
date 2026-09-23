# Plano: ajustes na Estrutura de Menu (ligar/desligar, mover, submenus)

> **Status (22/09/2026): aprovado, em execução.** Origem: o usuário procurou em
> Administração um "cadastro de módulos" com habilitar/desabilitar e
> adicionar/remover/mover rotinas, e não achou — a tela existe
> (`/admin/estrutura`, "Estrutura de Menu"), mas não faz essas três coisas.

## Vocabulário (a origem da confusão)

| Modelo | O que é | Aparece na barra lateral |
|---|---|---|
| **Módulo** | O grupo: Administração, Comercial, CRM… | Sim, como título do grupo |
| **Menu** | O item clicável, com rota (`/crm/oportunidades`) | Sim, é o link |
| **Rotina** | O código de permissão (`oportunidades`) exigido pelo `@RequirePermission` | Não, só em Perfis |

Na fala do usuário, "rotina" é o **item do menu** — o que o modelo chama de
`Menu`. Onde este plano diz "mover uma rotina de módulo", o que se move é o
`Menu`. Mover a `Rotina` (o código de permissão) entre menus é o item 3.

## O que muda

### 1. Ligar/desligar módulo inteiro — direto na linha

Exemplo do usuário: desligar o **CRM inteiro**. Um switch na linha do módulo,
sem abrir diálogo, e o mesmo switch em menu e rotina.

O campo `ativo` já existe em `Modulo`, `Menu` e `Rotina`, já está no contrato e
a API já aceita — **só não tem controle na tela, e nada no sistema lê o campo**.
`listModulos` não filtra por `ativo`, então hoje desligar não desliga nada.

Decisões:

- **Cascata na leitura, não na gravação.** Desligar o módulo tira do ar os menus
  e rotinas dele sem escrever `ativo: false` em cada um — religando o módulo,
  tudo volta exatamente como estava.
- **Some do menu e fecha a porta.** Só sumir da barra lateral seria meia porta:
  quem digitasse `/crm/oportunidades` entraria. As permissões das rotinas de
  módulo/menu inativo passam a ser podadas na montagem do token e do `/me`, que
  é onde elas nascem — a barra lateral já é filtrada por permissão, então ela
  some de graça, e a API passa a responder 403. Defasagem de até 15 min (vida do
  access token) para quem já está logado.
- **Admin (`sistemaBase`) continua entrando pela URL.** O `PermissionsGuard`
  libera `isAdmin` antes de olhar a lista. Aceito: quem liga e desliga é ele.

### 2. Mover item entre módulos arrastando

Hoje o arrastar só reordena **dentro** do módulo, porque cada módulo tem o seu
`DndContext`. Passa a ser um `DndContext` único com um `SortableContext` por
módulo, no padrão multi-container do dnd-kit: soltar o item sobre outro módulo
muda o `moduloId`. O seletor de módulo destino no diálogo do menu continua como
caminho alternativo.

### 3. Mover rotina (código de permissão) entre menus

O diálogo da rotina fixa o `menuId` do menu onde foi aberto. Ganha um seletor de
menu destino. A API já aceita `menuId` no `PATCH /rotinas/:id` — é só UI. O
código (`codigo`) não muda, então **as permissões de perfil são preservadas**.

### 4. Submenus

`menuPaiId` existe no schema, no contrato e na documentação do controller, mas
está morto: o diálogo sempre grava `null` e a barra lateral renderiza plano.
Passa a valer, **com dois níveis** (menu → submenu, sem neto):

- `POST/PATCH /menus` valida: o pai existe, é do mesmo módulo, não é o próprio
  menu, não é ele mesmo um submenu, e um menu que já tem filhos não vira filho.
- `GET /modulos` devolve só os menus raiz, com `submenus` aninhados.
- Barra lateral, busca global e `ResponsiveRouteGuard` passam a descer o nível.

### 5. Estrutura de Menu no celular

A tela está com `disponivelTelaPequena: false` no catálogo — some abaixo de
768px. Passa a `true` (leitura e os switches funcionam; o arrastar continua
sendo de tela grande).

**Como isso chega numa base que já existe:** `sincronizarEstrutura` faz upsert do
menu com `update: dados` — ou seja, ele **atualiza** nome, ícone, rota, ordem,
`moduloId` e `disponivelTelaPequena` de todo menu do catálogo. Rodar
`sincronizar-catalogo` basta; não é preciso migration para isto. (Da rotina ele
atualiza nada: `update: {}`.)

**O outro lado disso — a tela não vence o catálogo.** Mover, reordenar ou
renomear pela tela de Estrutura um menu que está no `catalogo-sistema.ts` vale
até o próximo `sincronizar-catalogo`, que devolve tudo ao que o arquivo diz. Só
o que a tela cria do zero (e os campos que o sync não toca, como `ativo` do
menu) sobrevive. Quem quiser a mudança permanente edita o catálogo — como foi
feito aqui com "Campos do Produto". Se isso incomodar na prática, o caminho é
o sync deixar de sobrescrever o que foi mexido à mão; fica registrado, não
feito.

### 6. Bug achado no caminho: barra lateral vazia no celular

`listModulos` devolve as rotinas com `select: { id, codigo, nome }` — sem
`disponivelTelaPequena`. Quem consome (`app-sidebar`, `global-search`,
`ResponsiveRouteGuard`) faz `menu.rotinas.some((r) => r.disponivelTelaPequena)`,
que com o campo `undefined` é **sempre falso**. Efeito abaixo de 768px: nenhum
menu na barra, nada na busca, e toda rotina barrada com "Abra esta rotina em uma
tela maior". Corrigido incluindo o campo (e `ativo`) no select.

## Onde mexe

| Camada | Arquivo | O quê |
|---|---|---|
| API | `modules/estrutura/estrutura.service.ts` | filtro de `ativo` em cascata, submenus aninhados, validação de `menuPaiId`, select das rotinas |
| API | `modules/estrutura/estrutura.controller.ts` | `GET /estrutura/arvore` (árvore com inativos, exige `estrutura.visualizar`) |
| API | `modules/auth/auth.service.ts` | poda das permissões de rotinas em módulo/menu inativo (token e `/me`) |
| Contratos | `packages/contracts/src/menu.ts` | `submenus` no `menuSchema` |
| Front | `app/(app)/admin/estrutura/page.tsx` | switch de ativo inline, arrastar entre módulos, destino da rotina, menu pai, submenus |
| Front | `components/layout/app-sidebar.tsx`, `global-search.tsx`, `responsive-route-guard.tsx` | render e guarda de submenus |
| Catálogo | `prisma/catalogo-sistema.ts` | `estrutura` liberada em tela pequena |

## Por que `GET /estrutura/arvore` novo

`GET /modulos` é o menu do usuário (aberto a qualquer autenticado) e passa a
esconder o que está inativo. A tela de Estrutura precisa **ver o inativo para
religar** — se ela consumisse o mesmo endpoint, desligar um módulo o faria
sumir da própria tela que o desliga, sem volta pela interface. Por isso a árvore
completa vira endpoint próprio, atrás de `estrutura.visualizar`.

## Fora de escopo

- ~~Desligar módulo por empresa~~ — **feito depois**, ver "Liga/desliga por
  empresa" no fim deste plano.
- Três níveis de menu.

## Execução

**Feito (22/09/2026), com `tsc`, `eslint` e os testes de `auth`/`catálogo` passando:**

| Item | Onde |
|---|---|
| `GET /modulos` só devolve o que está ligado, em cascata, com submenus aninhados | `estrutura.service.ts` |
| `GET /estrutura/arvore` — árvore completa para a tela de administração | `estrutura.controller.ts` |
| Validação de `menuPaiId` (dois níveis, mesmo módulo, sem ciclo) e submenus acompanhando o pai na troca de módulo | `estrutura.service.ts` |
| Permissão de rotina em módulo/menu desligado não entra no token nem no `/me` (+ teste) | `auth.service.ts`, `auth.service.spec.ts` |
| Switch **Ativo** na linha do módulo, do menu e da rotina, com aviso do efeito | `admin/estrutura/page.tsx` |
| Arrastar menu de um módulo para outro (um `DndContext` só) | `admin/estrutura/page.tsx` |
| Seletor de menu destino na rotina, e de menu pai no menu | `admin/estrutura/page.tsx` |
| Submenus na barra lateral, na busca global e no guard de tela pequena | `app-sidebar.tsx`, `global-search.tsx`, `responsive-route-guard.tsx`, `use-menu.ts` |
| Correção do `select` que deixava a barra lateral vazia no celular | `estrutura.service.ts` |
| Tela de Estrutura liberada em tela pequena | `catalogo-sistema.ts` |

**Submenu não é arrastável** nesta versão: ele muda de pai e de módulo pelo diálogo
("Dentro de"). Arrastar continua valendo para módulo e para menu de primeiro nível.

**Falta validar na tela** (os containers de dev não recarregam de forma confiável —
reiniciar a API antes, ver runbook).

**Em aberto:** a mesma tela em dois módulos com direitos diferentes — ver abaixo.

## Em aberto: mesma tela em dois módulos, direitos diferentes

Pedido: "Cadastro de Produtos no Comercial só visualiza; em Cadastros altera".

O obstáculo não é a árvore de menu, é o RBAC: a API recebe `PATCH /produtos/:id` e
**não sabe por qual menu a pessoa entrou**. Mandar a origem pelo cliente não serve de
barreira — quem chama a API escolhe o que mandar (`acesso é código`, CLAUDE.md).

Então "direitos por caminho" exige **códigos de rotina diferentes** para a mesma tela.
Três desenhos possíveis, do mais barato ao mais completo:

1. **Nada a construir** — se quem consulta pelo Comercial é um *perfil* e quem altera
   por Cadastros é *outro*, isso já funciona hoje: dois menus (um em cada módulo)
   apontando para a mesma rota, e cada perfil com a sua permissão. O direito já é por
   perfil, não por caminho.
2. **Rotina extra por tela** — criar `produtos-consulta` e aceitá-la como alternativa
   no `@RequirePermission` do GET de produtos (o decorator já é um OR). Duas linhas por
   endpoint, sem migration, mas feito caso a caso.
3. **Rotina espelho** — `Rotina.espelhoDeId` + as ações que o espelho pode conceder;
   na montagem do token `produtos-consulta.visualizar` vira `produtos.visualizar`.
   Vale para qualquer tela sem tocar em controller, mas pede migration, UI na Estrutura
   e na tela de Perfis.

## Produtos em dois módulos (decidido em 22/09/2026)

Pedido: "Cadastro de Produtos no Comercial só visualiza; em Cadastros altera" e,
depois, "vamos criar um Produto novo no módulo de Cadastros com opção de CRUD".

Decisões do usuário:

- **Rotina própria** para a tela de Cadastros (`produtos-cadastro`), não a mesma
  `produtos`. O menu nasce da permissão, então com um código só quem consulta no
  Comercial passaria a ver também a tela de manutenção. Os endpoints de
  `/produtos` aceitam as duas rotinas — o `RequirePermission` é um OR.
- **Produto do ERP fica travado na tela.** Quem tem `chave` de integração é
  espelho do Protheus: o import regrava por `chave`, então editar ali seria
  trabalho perdido. A API recusa (`CAMPOS_DO_ERP`) e a tela nem oferece — os
  campos vêm desabilitados, com aviso. Excluir também é recusado: o import
  recriaria. Produto **nascido na plataforma** (sem `chave`) é CRUD completo.
- `exibirFotoOrcamento` é o único campo do cadastro que o ERP não manda, então
  continua editável nos dois casos.
- **"Campos do Produto" mudou de módulo**: saiu de Administração e passou a
  ficar logo depois de Produtos, em Cadastros. Consequência aceita pelo usuário
  ("pode ser acessada por todos que têm acesso ao módulo"): a rotina deixa de
  cair na reserva que `corrigirPermissoesDoDiretor` aplica às rotinas de
  Administração. A rota do arquivo segue `/admin/produtos-campos` — só o lugar
  no menu mudou.

Entregue:

| Item | Onde |
|---|---|
| Menu "Produtos" em Cadastros + "Campos do Produto" logo abaixo | `catalogo-sistema.ts` |
| Rotina `produtos-cadastro` numa base existente | migration `20260922120000_perm_produtos_cadastro` |
| Permissão para os perfis `sistemaBase` | migration `20260922130000_perm_produtos_cadastro_admin` |
| Trava dos campos do ERP na edição e na exclusão | `produtos.service.ts` |
| Rotina alternativa em todas as rotas de `/produtos` | `produtos.controller.ts` |
| `chave` exposta na leitura do produto | `packages/contracts/src/produto.ts` |
| Lista, novo e edição | `app/(app)/cadastros/produtos/…`, `components/crud/produto-form.tsx` |

**Armadilha encontrada:** a migration modelo de permissão (`perm_produtos_campos`
e anteriores) filtra `perfis.nome = 'Administrador'`, nome que não existe — os
perfis são "Administrador Empresa" e "Administrador da Plataforma". O INSERT
casa zero linhas e não reclama, e a tela nasce invisível até para o
administrador. Registrado em `apps/api/prisma/migrations/README.md` e no
runbook; o critério certo é `sistemaBase = true`.

## Aplicado em dev (22/09/2026)

`migrate deploy` (duas migrations), `sincronizar-catalogo` (moveu "Campos do
Produto" e liberou a Estrutura no celular) e o restart duplo da API, com a rota
`/api/estrutura/arvore` confirmada no `Mapped`. Falta a conferência visual das
telas.

## Liga/desliga por empresa (decidido e feito em 22/09/2026)

O usuário perguntou "o menu não é por empresa?" depois de esbarrar em
*"Apenas administradores da plataforma podem alterar o catálogo global"*.

**Não era.** `modulos`, `menus`, `rotinas`, `perfis` e `perfil_permissoes` são
todos globais — nenhum tem `empresaId`. O único ponto por empresa é
`usuario_empresas.perfilId`. Por isso desligar o CRM desligaria para todos os
clientes, e por isso o `PlatformAdminGuard` barra o administrador de empresa.

Agora são **dois liga/desliga**, com donos diferentes:

| | Onde mora | Quem mexe | Alcance |
|---|---|---|---|
| Catálogo | `modulos.ativo`, `menus.ativo`, `rotinas.ativo` | Administrador da plataforma | Todos os clientes |
| Empresa | `empresa_modulos`, `empresa_menus` | Administrador da empresa (`estrutura.editar`) | Só a empresa ativa |

Decisões:

- **Ausência de linha = ligado.** Só a exceção é gravada, então empresa nova e
  módulo novo já nascem disponíveis, sem carga inicial.
- **Dois níveis, não três.** Módulo e menu têm o controle por empresa; rotina
  não — ela é o código de permissão, e quem a recebe já se decide em Perfis.
- **A barreira é a mesma do catálogo**: a poda de permissões no token e no `/me`
  passou a considerar as duas tabelas, então o módulo desligado na empresa
  também responde 403 na URL digitada à mão.
- **RLS obrigatória** nas duas tabelas, na mesma migration
  (`20260922140000_empresa_modulos_menus`), como manda `migrations/README.md`.
- A limpeza da base de demonstração **preserva** as duas: é configuração do
  menu da empresa, não dado de negócio (a trava `demo-limpeza.spec` pegou isso).

Na tela, o switch da linha passou a ser o **da empresa** (a decisão do dia a
dia), e o global virou "Ativo na plataforma inteira" no menu "…", visível só
para administrador da plataforma. Para quem não é, os controles de catálogo
(criar, renomear, mover, excluir, arrastar) somem, com um aviso explicando por
quê — antes eles apareciam e davam 403 ao serem usados.

## Ajustes de interface pedidos no caminho

- **Dois switches mudos na linha.** "Ativo" e "Tela pequena" ficavam lado a
  lado com o rótulo escondido abaixo de `2xl` — na largura real de uso, dois
  controles idênticos sem legenda. Ficou **um** switch rotulado ("Ativo") e
  "Disponível no celular" foi para o menu "…", escrito por extenso.
- **Menu do avatar** (`app-topbar.tsx`): saiu o item "Meu perfil" e o e-mail do
  cabeçalho; o cabeçalho (foto + nome, com um lápis) virou o próprio atalho
  para `/perfil`. Saiu também "Conectar WhatsApp".
- **Texto corrompido no código.** A mensagem do `PlatformAdminGuard` estava
  gravada como "catÃ¡logo global" — três arquivos tinham mojibake de UTF-8 lido
  como Latin-1 (`platform-admin.guard.ts`, `escape-html.ts`,
  `prisma.service.ts`). Corrigidos.
