# Equipamentos de comodato

Cadastro mestre-detalhe: no cabeçalho, o produto que pode ser comodatado; nos
itens, os produtos que podem ser aplicados nele (o papel interfolhado do
dispenser de toalha interfolha, o químico da dosadora).

## Decisões

- **2026-10-07 — os itens são a relação `aplicacao` que já existe**
  (`produto_relacionados`). Ela foi criada para isto, estava vazia, e já
  aparece no card "Relacionados" do produto e nas respostas do assistente.
  Uma tabela própria daria duas listas do mesmo fato. O cabeçalho é tabela
  nova (`equipamentos_comodato`), porque o equipamento existe no cadastro
  antes de ter qualquer aplicação.
- **2026-10-07 — "popular pelas notas" (decisão do usuário):** cria os
  cabeçalhos a partir dos produtos que já saíram em remessa de comodato
  (CFOP 5908/6908) e **sugere** os aplicáveis por compra conjunta; a sugestão
  só grava com confirmação, item a item.
- **2026-10-07 — acesso (decisão do usuário):** Administrador, Diretor,
  Gerente e Supervisor. Módulo Cadastros.
- **2026-10-07 — produto de categoria de equipamento não é aplicável**
  (decisão do usuário). Quais categorias são de equipamento a empresa marca em
  Cadastros > Categorias ("Equipamento de comodato", `categorias.editar`), e
  não por regra automática: as remessas de comodato também levaram produto de
  LIMPEZA GERAL, DESCARTÁVEIS e DESCONTINUADOS, e "toda categoria que tem
  equipamento" bloquearia os químicos das dosadoras e uma das bobinas de
  papel. Escolhida a marcação na categoria, e não um parâmetro de texto com
  códigos, porque código digitado errado desligaria a regra sem aviso. A
  recusa mora em `ProdutoRelacionadosService.criar` — vale para esta tela e
  para o card "Relacionados" — e olha categoria e subcategoria do produto; as
  sugestões já não trazem esses produtos.
- **Excluir o equipamento não apaga as aplicações**: elas são conhecimento do
  produto e continuam no card "Relacionados". Restaurar o cabeçalho as traz de
  volta.

## Sugestão por compra conjunta

Para o equipamento E: clientes que receberam E em comodato (qualquer época) e
o que eles compraram em notas de venda dos últimos 24 meses. Entra o produto
que pelo menos 3 desses clientes compram e cuja taxa entre eles é ao menos
1,5× a taxa entre todos os clientes. Ordem: descrição com palavra em comum com
a do equipamento primeiro, depois quantos clientes com E compram.

Medido em 2026-10-07: para o toalheiro autocorte, as bobinas de papel toalha
vêm no topo; para o dispenser interfolha (EEDTI204), o papel interfolhado
aparece entre os primeiros, misturado a sabonete e papel higiênico (quem tem
um dispenser costuma ter os outros). Por isso é sugestão revisada, nunca
gravação automática.

Uma raiz sozinha engana: "INTER" do dispenser interfolha casa também com o
papel **higiênico** interfolhado. Por isso a ordem conta as raízes em comum
(toalha + interf = 2 contra 1), e o papel toalha interfolhado vem antes.
Resultado medido depois disso, para o EEDTI204: os 9 primeiros são papel
toalha interfolhado.

## Entregas

- [x] Tabela, RLS, rotina e permissões (migration
  `20261007033504_equipamentos_comodato`) + catálogo
- [x] API: CRUD do cabeçalho, aplicações, sugestões, popular — testada ponta a
  ponta em 2026-10-07 com token de Gerente (403 sem a permissão); os 267
  equipamentos que o teste criou foram apagados, o primeiro "popular" de
  verdade é do usuário
- [x] Telas: lista (`/cadastros/equipamentos-comodato`) e detalhe
- [x] Categoria de equipamento (marcação em Categorias, desce para as
  subcategorias; subcategoria nova do ERP herda a do pai)
- [x] Sugestão "Comuns aos clientes" + seleção de vários itens
  (`GET /:id/comuns?minimo=`, `POST /:id/aplicacoes/lote`). Base: clientes
  **com o equipamento em poder** (remessa − retorno > 0) que compraram nos
  últimos 24 meses; agrupado por subcategoria. Medido no EEDTI204: 51
  clientes, PAPEL TOALHA INTERFOLHADO em 84% — o produto mais comprado sozinho
  chega a 31%, por isso o agrupamento. Em 100% não aparece nada.
- [ ] Conferência visual das telas pelo usuário

## Próximo pacote (pedido em 2026-10-07)

- **Aviso + ferramenta de IA:** cliente com equipamento em poder que não
  comprou, no mês, nenhum dos produtos aplicáveis.
- **Ícone de aviso** na lista da Posição de Cliente para esse caso.
- **Comodato baixado:** marcar um comodato como baixado para não entrar no
  saldo nem no aviso, com filtro para encontrar os marcados e desfazer se a
  marca estiver errada.

Decisões do usuário (2026-10-07):

- Marca-se o **equipamento no cliente** (o saldo daquele produto naquele
  cliente), não a nota de remessa.
- O aviso olha os **últimos 30 dias**: cliente com equipamento em poder sem
  compra de nenhum aplicável nesse período.
- Marca e desmarca **quem tem acesso ao cliente**; fica registrado quem marcou,
  e a marcação entra no **histórico de atendimento** do cliente.

Entregue em 2026-10-07:

- [x] **Baixa** (`comodato_baixas`, migration `20261007150000_comodato_baixas`):
  guarda a quantidade (o saldo do momento), motivo, autor; desfazer grava
  `desfeitaEm/Por`. Rota `POST/DELETE /clientes/:id/comodato-baixas` com
  `posicao-cliente.visualizar` + cliente na carteira (404 fora dela). Cada ação
  vira atividade concluída no histórico, em nome do vendedor do cliente.
- [x] **Saldo** = enviado − devolvido − baixas vigentes, na aba Equipamentos
  (botões Baixar/Desfazer, coluna "Qtd. baixada" com quem/quando/motivo,
  filtros "Sem consumo" e "Baixados").
- [x] **Aviso** (`clientes/comodato-sql.ts`): saldo > 0 de equipamento
  cadastrado e ativo com aplicáveis, e nenhuma compra de aplicável (nota de
  saída normal ativa, não só a que gerou duplicata) nos últimos 30 dias. Ícone
  na lista da Posição (coluna "Aviso"), filtros rápidos "Comodato sem consumo"
  e "Comodato baixado", ícone na aba Equipamentos. A expressão da lista é um
  `c.id IN (conjunto)` sem correlação: a versão por cliente levava 5,9 s no
  filtro e estourava a transação; esta, 1,8 s na base de dev.
- [x] **Ferramenta de IA** `comodato_sem_consumo` (agente interno, leitura,
  `posicao-cliente.visualizar`) — delega à listagem com o filtro; e
  `posicao_cliente` passou a trazer os equipamentos em poder com o aviso.
- [ ] Conferência visual das telas pelo usuário. Hoje nenhum equipamento tem
  aplicáveis cadastrados, então o aviso só aparece depois de cadastrá-los.
