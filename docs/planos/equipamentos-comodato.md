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
- [ ] Conferência visual das telas pelo usuário
