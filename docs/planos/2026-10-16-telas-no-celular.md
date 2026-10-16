# Telas no celular — levantamento e controle

> Criado em 2026-10-16. **Documento vivo:** atualizar a coluna *Situação* a cada tela entregue.
> Origem: pedido de rever todas as telas e decidir o que fica disponível no celular.

## 1. Ponto de partida

- **62 telas** com rota no menu. **3** já ajustadas para celular nesta frente.
- **Todas estão marcadas como "disponível no celular"** (módulo, menu e rotina) na base de dev, que é cópia da produção. Ou seja, hoje a marcação **não filtra nada**: o celular mostra o sistema inteiro, adaptado ou não.
- A marcação existe em três níveis (módulo › menu › rotina) e vale se os **três** estiverem ligados. Desde 2026-10-16 cada **empresa** pode sobrepor a decisão do catálogo (coluna `telaPequena` em `empresa_modulos/menus/rotinas`; tela *Administração › Estrutura*, interruptor **Celular**).
- Em `catalogo-sistema.ts` o padrão de todo menu é `true`. *A verificar:* se `sincronizar-catalogo` sobrescreve o valor ajustado na tela. Se sobrescrever, "desligar no celular" precisa ir para o catálogo.

## 2. Critério — quando uma tela está "ajustada"

Conferida **em aparelho** (iPhone, ~390 px de largura), não só lendo o código:

1. Sem rolagem lateral da **página** (a rolagem lateral de uma tabela dentro de um cartão é aceitável).
2. Nada cortado nas bordas: títulos, botões, diálogos e menus cabem na tela.
3. Alvos de toque confortáveis; campo de texto não fica escondido atrás do teclado.
4. Diálogos e cortinas com margem, rolagem interna e botão de ação visível.
5. Tabela larga: coluna-chave fixa ou lista em cartões; nada de coluna essencial escondida.

Legenda: ⬜ não revisada · 🔎 revisada, com pendência · ✅ ajustada (código) · 📱 conferida em aparelho · ⛔ desligada no celular

## 3. Decisões que dependem do usuário

| # | Decisão | Proposta | Resposta |
|---|---------|----------|----------|
| D1 | Quais telas **não** devem existir no celular | Estrutura, Perfis (matriz de permissões), Integração, Campos do Cliente, Campos do Produto, E-mail, Agente IA — são telas de configuração densas | _pendente_ |
| D2 | Onde registrar "desligado no celular" | Pela tela Estrutura (por empresa) *ou* no catálogo (vale para todos) | _pendente_ |
| D3 | Prioridade de revisão | Primeiro o que o vendedor usa na rua: Posição de Cliente, Estoque, Produtos, Orçamentos, Agenda, Atividades, Oportunidades | _pendente_ |

## 4. Alavancas — componentes compartilhados

Corrigir aqui melhora muitas telas de uma vez.

| Componente | Usado por | Situação | Observação |
|-----------|-----------|----------|-----------|
| `crud/entity-table` | ~25 listas (Cadastros, Orçamentos, Produtos, Clientes…) | ⬜ | Rola para o lado, com seletor de colunas; sem coluna fixa nem modo cartão |
| `crud/crud-header` + `filters-popover` | as mesmas listas | ⬜ | Filtros em popover: conferir largura e rolagem |
| `crud/paginacao` | listas e consultas | ⬜ | |
| `consultas/consulta-vendas-view` | 5 Consultas | ⬜ | |
| `relatorios/relatorio-paginado` | 3 Relatórios | ⬜ | |
| `crud/orcamento-form` | Orçamentos (2369 linhas) | ⬜ | Formulário grande: o mais crítico para o vendedor |
| `crud/oportunidades-kanban` | Oportunidades | ⬜ | Kanban no celular: colunas por rolagem/aba |
| `ui/janela-flutuante` | Assistente e atendimento | ✅ | Tela cheia abaixo de 640 px; sem botão maximizar |
| `ui/resizable-sheet-content` | cortinas | ✅ | Já ocupa a tela inteira no celular |

## 5. Fora do menu

| Item | Situação | Observação |
|------|----------|-----------|
| Tela inicial | ✅ | Faixa de resumo empilha no celular (21039cf) |
| Barra superior | ✅ | Ajuda/Sobre/Tour vão para o menu da foto |
| Perfil | ✅ | Refeita em 3 abas (Conta, WhatsApp, Segurança), cada cartão com seu Salvar; avatares maiores (grade 3–6 colunas) |
| Rolagem lateral do documento | ✅ 📱 pendente | `overflow-x: clip` em html/body/shell (577fd35). **Conferir no iPhone após o deploy** — a causa exata não foi isolada |

## 6. Inventário das telas

Colunas: *Tipo* = como a tela é construída (lista usa EntityTable; consulta e relatório usam componente próprio). *Linhas* = tamanho do arquivo, só como indício de esforço. *Celular hoje* = marcação no catálogo/base.

| Módulo | Tela | Rota | Tipo | Linhas | Celular hoje | Situação | Proposta | Feito |
|--------|------|------|------|-------:|--------------|----------|----------|-------|
| Administração | Grupo Econômico | `/admin/grupo-economico` | Tela própria | 2 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Empresas | `/admin/empresas` | Lista (EntityTable) | 245 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Usuários | `/admin/usuarios` | Lista (EntityTable) | 361 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Perfis | `/admin/perfis` | Lista (EntityTable) | 361 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Administração | Estrutura de Menu | `/admin/estrutura` | Tela própria | 1609 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Administração | Integração | `/admin/integracao` | Lista (EntityTable) | 828 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Administração | Campos do Cliente | `/admin/clientes-config` | Tela própria | 382 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Administração | Parâmetros | `/admin/parametros` | Lista (EntityTable) | 286 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Acessos | `/admin/acessos` | Lista (EntityTable) | 720 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Backups | `/admin/backups` | Tela própria | 61 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Liberação de Suporte | `/admin/suporte-acesso` | Tela própria | 320 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Feriados | `/admin/feriados` | Lista (EntityTable) | 210 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | SMS | `/admin/sms` | Tela própria | 313 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | E-mail | `/admin/email` | Tela própria | 1304 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Administração | WhatsApp | `/admin/whatsapp` | Tela própria | 828 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Comunicados | `/admin/comunicados` | Lista (EntityTable) | 496 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Contas Bancárias | `/admin/contas-bancarias` | Lista (EntityTable) | 735 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Administração | Agente IA | `/admin/agente` | Tela própria | 1514 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Comercial | Dashboard | `/comercial/dashboard` | Tela própria | 348 | ligado | ✅ Ajustada | Manter — revisar | Cartões 2 colunas (d90ceef) |
| Comercial | Produtos | `/comercial/produtos` | Lista (EntityTable) | 222 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Comercial | Posição de Cliente | `/comercial/posicao-cliente` | Lista (EntityTable) | 757 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Comercial | Estoque | `/comercial/estoque` | Lista (EntityTable) | 244 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Comercial | Conversas | `/comercial/atendimento` | Tela própria | 1825 | ligado | ✅ Ajustada | Manter — revisar | Diálogos com margem, popover, 2ª via/DANFE, orçamento, fichas, nova conversa (7a36f05, 33862de, 512bd4c) |
| Comercial | Meus Atendimentos | `/comercial/meus-atendimentos` | Tela própria | 456 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Comercial | Orçamentos | `/crm/orcamentos` | Lista (EntityTable) | 373 | ligado | ⬜ Não revisada | Manter — revisar |  |
| CRM | Leads | `/comercial/leads` | Tela própria | 327 | ligado | ⬜ Não revisada | Manter — revisar |  |
| CRM | Oportunidades | `/crm/oportunidades` | Lista (EntityTable) | 336 | ligado | ⬜ Não revisada | Manter — revisar |  |
| CRM | Atividades | `/crm/atividades` | Lista (EntityTable) | 316 | ligado | ⬜ Não revisada | Manter — revisar |  |
| CRM | Agenda | `/crm/agenda` | Tela própria | 461 | ligado | ✅ Ajustada | Manter | Visões Mês, Semana e Dia; celular abre no Dia, semana só seg–sex, mês em miniatura; celular mostra só agendamentos pendentes (sem concluídas nem orçamentos); grade completa e filtros só de 768 px para cima |
| Gerencial | Vendedores | `/gerencial/vendedores` | Lista (EntityTable) | 507 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Objetivos | `/gerencial/objetivos` | Lista (EntityTable) | 305 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Recado para a equipe | `/gerencial/recados` | Tela própria | 691 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Histórico do WhatsApp | `/gerencial/whatsapp` | Tela própria | 690 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Equipamentos de Comodato | `/gerencial/equipamentos-comodato` | Lista (EntityTable) | 361 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Sugestão de Compra | `/gerencial/sugestao-compra` | Lista (EntityTable) | 518 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Consultas | Vendas por Cliente | `/consultas/vendas-cliente` | Consulta | 16 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Consultas | Vendas por Produto | `/consultas/vendas-produto` | Consulta | 39 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Consultas | Vendas por Categoria | `/consultas/vendas-categoria` | Consulta | 12 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Consultas | Vendas por Vendedor | `/consultas/vendas-vendedor` | Consulta | 18 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Gerencial | Dashboard Gerencial | `/gerencial/dashboard` | Tela própria | 881 | ligado | ✅ Ajustada | Manter — revisar | Cartões 2 colunas, coluna Vendedor fixa, barras menores (d90ceef) |
| Consultas | Evolução Mensal | `/consultas/evolucao` | Consulta | 10 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Produtos | `/cadastros/produtos` | Lista (EntityTable) | 263 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Campos do Produto | `/admin/produtos-campos` | Tela própria | 633 | ligado | ⬜ Não revisada | Desligar no celular (a confirmar) |  |
| Cadastros | Clientes | `/cadastros/clientes` | Lista (EntityTable) | 416 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Alterações de Cliente | `/cadastros/clientes-alteracoes` | Tela própria | 525 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Categorias | `/cadastros/categorias` | Lista (EntityTable) | 268 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Condições de Pagamento | `/cadastros/condicoes-pagamento` | Lista (EntityTable) | 93 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Armazéns | `/cadastros/armazens` | Lista (EntityTable) | 89 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Tabelas de Preço | `/cadastros/tabelas-preco` | Lista (EntityTable) | 104 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Estados | `/cadastros/estados` | Lista (EntityTable) | 139 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Municípios | `/cadastros/municipios` | Lista (EntityTable) | 186 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | CEPs | `/cadastros/ceps` | Lista (EntityTable) | 194 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Países | `/cadastros/paises` | Lista (EntityTable) | 139 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | CNAEs | `/cadastros/cnaes` | Lista (EntityTable) | 139 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Regras de Desconto | `/cadastros/regras-desconto` | Lista (EntityTable) | 174 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Notas de Saída | `/comercial/notas-saida` | Lista (EntityTable) | 299 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Títulos a Receber | `/comercial/titulos-receber` | Lista (EntityTable) | 247 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Fornecedores | `/cadastros/fornecedores` | Lista (EntityTable) | 145 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Cadastros | Notas de Entrada | `/cadastros/notas-entrada` | Lista (EntityTable) | 159 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Relatórios | Compras | `/relatorios/compras` | Relatório | 167 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Relatórios | Vendas por vendedor | `/relatorios/vendas` | Relatório | 205 | ligado | ⬜ Não revisada | Manter — revisar |  |
| Relatórios | Estoque e compra | `/relatorios/estoque-compra` | Lista (EntityTable) | 330 | ligado | ⬜ Não revisada | Manter — revisar |  |

## 7. Ordem de trabalho proposta

1. **Decisões D1–D3** (usuário).
2. **Conferir no iPhone** o que já foi entregue (dashboards, atendimento, tela inicial, rolagem lateral) — após deploy.
3. **Alavancas**: EntityTable → CrudHeader/filtros → Paginação → Consultas → Relatórios.
4. **Telas do vendedor** (D3), uma a uma, começando por Posição de Cliente e Orçamentos.
5. **Telas de administração** que ficarem no celular.
6. **Aplicar as marcações** de "desligado no celular" conforme D1/D2.
7. Reconferir tudo em aparelho e marcar 📱.

## 8. Registro

| Data | O quê |
|------|-------|
| 2026-10-16 | Agenda (/crm/agenda) adaptada ao celular. |
| 2026-10-16 | Dashboards Gerencial e Comercial; interruptor Celular por empresa (migration `20261016120000`); diálogos do WhatsApp; tela inicial; bloqueio de rolagem lateral. Levantamento criado. |
