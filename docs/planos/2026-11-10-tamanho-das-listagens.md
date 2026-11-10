# Tamanho das listagens por perfil e por usuário

Pedido de 2026-11-10: deixar o número de itens por página das listagens
paginadas personalizável por usuário e por perfil.

## Decisões (usuário, 2026-11-10)

1. **Perfil + usuário.** O administrador define um padrão no Perfil; o usuário
   troca o seu em Meu perfil, e o do usuário vale acima do perfil.
2. **Um número para todas as listagens.** A troca feita no seletor de uma tela
   fica lembrada naquela tela.
3. **Opções 10, 20, 50 e 100** (antes 10, 20 e 50).

## Como ficou

Ordem do que vale numa tela (`useTamanhoPagina`, apps/web/src/hooks):

1. a troca lembrada daquela tela: localStorage, por usuário e por rota, só
   neste navegador;
2. `tamanhoPagina` do `/auth/me`: `usuarios.tamanhoPagina`, senão
   `perfis.tamanhoPagina`;
3. o padrão da própria tela (10 ou 20, como antes).

- Salvar em Meu perfil apaga as trocas lembradas tela a tela desse usuário
  neste navegador: quem escolhe um número para todas espera vê-lo em todas.
- O do usuário fica em `usuarios`, não no vínculo com a empresa: vale em todas
  as empresas do grupo.
- Valores aceitos: `TAMANHOS_PAGINA` (contratos). A migration
  `20261110180000_tamanho_pagina` repete a regra num CHECK.
- Rota nova: `PATCH /auth/me/tamanho-pagina` (`null` volta para o do perfil).
  O perfil grava pelo cadastro de Perfis, como os demais campos.

## Fora, de propósito

- **Listas paginadas no navegador da Posição de Cliente detalhada** (notas,
  devoluções, títulos, mix) e o relatório Estoque × Compra: usam o
  `usePaginaLocal`, com opções próprias (25, 50, 100) e padrão 50. Um 10 ou 20
  vindo do perfil cairia fora das opções do seletor delas.
- **Relatórios paginados** (`relatorio-paginado.tsx`): outro limite de página
  (até 20.000) e padrão 50.

## Estado

- [x] Banco, API, contratos, Meu perfil, cadastro de Perfil, 38 listagens:
  verificado em dev (tipos, migration aplicada, RLS e CHECK testados no banco)
- [ ] Conferência visual: Meu perfil › Listagens, Perfil › Itens por página, e
  uma listagem lembrando a troca
- [ ] Produção: a migration entra no `migrate deploy` da subida da imagem
