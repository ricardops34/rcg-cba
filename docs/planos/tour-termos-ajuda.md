# Tour, termos e ajuda — plano por processos

## Processo 1 — Termos de uso

Status: implementado.

- bloquear o uso da plataforma enquanto houver documento obrigatório pendente;
- registrar usuário, data/hora do servidor, empresa de contexto, IP, navegador e hash do conteúdo;
- manter versões publicadas imutáveis e exibir o histórico no perfil;
- permitir somente as rotas de autenticação, troca obrigatória de senha e aceite durante o bloqueio.

Antes da publicação, o texto inicial da migration deve ser revisado pela área jurídica e substituído por uma nova versão caso já tenha sido aplicado em algum ambiente.

## Processo 2 — Ajuda e Sobre

Status: implementado para a tela inicial e as rotinas dos módulos Comercial, CRM, Gerencial e Consultas.

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

Status: cobertura implementada para as 40 páginas atuais de Comercial, CRM, Gerencial e Consultas; homologação visual e acompanhamento de uso pendentes.

Rotinas concluídas:

- Dashboard Comercial: filtros, indicadores de objetivo e realizado e vendas por categoria;
- Posição do Cliente: busca, filtros rápidos e avançados, títulos, indicadores da listagem, ações e ficha completa do cliente.
- Orçamentos (listagem): busca, filtros de ativo e situação comercial, vendedor, leitura das propostas, vínculo com o ERP e ações. Tour `orcamentos`, versão 1; ajuda com finalidade, pré-requisitos e resultado esperado.
- Orçamentos (criação e edição em página): cliente, vendedor, condições, prazos, itens, mix, advertências, autorização, histórico e ações; edição inclui bloqueio e integração. Tours `orcamento-novo` e `orcamento-detalhe`, ambos versão 1. O início aguarda o formulário carregar e o tour de criação tem prioridade sobre a rota de detalhe. A cortina lateral da Posição do Cliente permanece fora deste escopo.

Nesta expansão foram acrescentados 34 tours, todos na versão 1, com códigos próprios por tela:

- Comercial: Produtos, Estoque, Notas de Saída e Títulos a Receber (listas e detalhes); importações de Fotos e Fichas Técnicas; Leads, Meus Atendimentos e Atendimento, incluindo preparação da conexão quando ela não está disponível.
- CRM: Oportunidades e Atividades (lista, cadastro e edição), além da Agenda.
- Gerencial: Vendedores e Objetivos (lista, cadastro e edição), Dashboard Gerencial e Recado para a Equipe.
- Consultas: Vendas por Cliente, Produto, Vendedor e Categoria, Evolução Mensal e Sugestão de Compra.

O catálogo `apps/web/src/lib/tours/rotinas-modulos.ts` compartilha os textos entre tour e ajuda, incluindo pré-requisitos e resultado esperado. Rotas fixas de cadastro e importação têm prioridade sobre rotas de detalhe. Os tours não executam ações de envio, importação ou gravação.

Verificações da expansão:

- `node scripts/validar-tours.cjs`: verifica cobertura das páginas dos quatro módulos, correspondência da ajuda, códigos únicos e marcações nos componentes usados por cada página;
- ESLint nos arquivos web alterados: sem erros; avisos existentes de React Hook Form e dependências de hook na importação de fichas;
- TypeScript: `tsc --noEmit` passou após regenerar os tipos do Next com `next typegen` e atualizar os tipos de desenvolvimento iniciando `next dev`. A referência antiga a `/comercial/recados` foi substituída pela rota atual `/gerencial/recados`.

Pendências da expansão:

- homologar a listagem de Orçamentos com perfis distintos, temas claro/escuro e desktop/celular, incluindo lista vazia e lista com propostas aprovadas com e sem código ERP;
- conferir apresentação automática, replay pelo cabeçalho/menu da conta e registro de conclusão ou dispensa do tour `orcamentos`;
- homologar os tours `orcamento-novo` e `orcamento-detalhe` com carregamento lento, navegação entre propostas, cliente predefinido, proposta aprovada/expirada, autorização pendente e perfis sem permissão de autorizar; repetir em celular e nos dois temas;
- acompanhar conclusão e abandono antes de revisar os passos;
- homologar os novos tours em desktop/celular, temas claro/escuro e perfis distintos, incluindo listas vazias, carregamento lento, ausência de conexão WhatsApp e exportação sem permissão;
- conferir conclusão, dispensa e replay dos novos códigos antes de ajustar o conteúdo; os destaques condicionais só aparecem quando o elemento está visível;
- definir futuras expansões fora dos quatro módulos cobertos.

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
