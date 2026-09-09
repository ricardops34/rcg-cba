# Tour, termos e ajuda — plano por processos

## Processo 1 — Termos de uso

Status: implementado.

- bloquear o uso da plataforma enquanto houver documento obrigatório pendente;
- registrar usuário, data/hora do servidor, empresa de contexto, IP, navegador e hash do conteúdo;
- manter versões publicadas imutáveis e exibir o histórico no perfil;
- permitir somente as rotas de autenticação, troca obrigatória de senha e aceite durante o bloqueio.

Antes da publicação, o texto inicial da migration deve ser revisado pela área jurídica e substituído por uma nova versão caso já tenha sido aplicado em algum ambiente.

## Processo 2 — Ajuda e Sobre

Status: implementado para a tela inicial, Dashboard Comercial e Posição do Cliente.

- ícone de ajuda contextual no cabeçalho;
- Central de ajuda e página detalhada da rotina inicial;
- página Sobre com versão, segurança e acesso aos documentos aceitos;
- atalhos equivalentes no menu da conta em telas pequenas.

## Processo 3 — Tour piloto da tela inicial

Status: implementado.

- apresentação automática na primeira visita de cada versão;
- replay manual pelo ícone no cabeçalho;
- passos sobre menu, busca, atalhos, comunicados, aniversariantes, notificações, assistente, ajuda, tema e conta;
- adaptação aos elementos visíveis conforme tela e permissões;
- navegação por botões, setas do teclado e Escape;
- registro histórico por usuário, empresa, versão, origem, status e último passo;
- isolamento por empresa com Row-Level Security.

## Processo 4 — Expansão para outras rotinas

Status: em andamento.

Rotinas concluídas:

- Dashboard Comercial: filtros, indicadores de objetivo e realizado e vendas por categoria;
- Posição do Cliente: busca, filtros rápidos e avançados, títulos, indicadores da listagem, ações e ficha completa do cliente.

Para cada nova rotina:

1. escrever finalidade, pré-requisitos e resultado esperado na Central de ajuda;
2. definir os passos do tour e marcar os elementos com `data-tour`;
3. criar um código e uma versão independentes;
4. validar perfis diferentes, tema claro/escuro, desktop e celular;
5. medir conclusão e pontos de abandono antes de ajustar o conteúdo.

## Implantação

- aplicar as migrations `20260909130000_termos_uso` e `20260909140000_tour_interativo` pelo fluxo normal do ambiente;
- reconstruir `@plataforma/contracts`, gerar o Prisma Client e publicar API e web em conjunto;
- homologar com um usuário novo e outro que possua mais de uma empresa.
