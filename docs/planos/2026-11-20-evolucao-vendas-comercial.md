# Evolução de Vendas (Comercial)

Pedido do usuário em 2026-11-20. Rotina nova no módulo Comercial, respeitando a
hierarquia de quem acessa (escopo de carteira, `resolverEscopoVendedores`).

## O que é

- **Filtros:** período (abre com 4 meses, até 12 — a mesma regra das Consultas),
  estado, município, produto, categoria, CNAE e vendedor (este só para quem não é
  vendedor restrito).
- **Três visões**, cada uma com valor por mês, total e % do total:
  - **Venda × Categoria** → produto → cliente;
  - **Venda × Cliente** → produto;
  - **Venda × CNAE** → produto → cliente.
- Listagem em árvore como nas Consultas (expandir, busca) e **gráficos**: evolução
  mensal dos principais grupos (o mesmo `GraficoEvolucao` das Consultas) e
  participação de cada grupo no total.

## Decisões de implementação (sem pergunta)

- Mesma base de venda das Consultas e do Dashboard (`corteDeVenda`), somando
  `vlrTotal` dos itens; quantidade = soma de `quantidade`.
- Vendedor da apuração: o parâmetro da empresa (`CONSULTA_VENDAS_BASE_VENDEDOR`).
- **CNAE = o principal do cliente** (sem principal marcado, o primeiro). A consulta
  de CNAE das Consultas soma em todos os CNAEs do cliente, e o % passaria de 100.
- Categoria = a categoria (raiz) do produto, como na consulta por categoria.
- Árvore inteira numa ida só: 12 meses da RCG dão ~13 mil linhas (0,25 s).
- Rotina `evolucao-vendas` no Comercial: Vendedor, Supervisor, Gerente, Diretor e
  administradores (migration `20261120200000_evolucao_vendas`).
- **Sem exportação** (decisão do usuário, 2026-11-20): no módulo Comercial só o
  Orçamento exporta. Exportar fica nas Consultas.

## Gráficos em Apache ECharts (2026-11-20)

Decisão do usuário: os gráficos desta tela passam a usar o **Apache ECharts**
(`echarts` 6.1.0, licença Apache 2.0), escolhido pelas animações. Recharts/shadcn
e Nivo foram comparados e animam bem menos.

- Base comum em `apps/web/src/components/graficos/echarts.tsx`: import por partes
  (barra, linha, pizza), renderer SVG, cores lidas das variáveis do tema (`--viz-N`,
  `--border`...) e recalculadas na troca claro/escuro, e tooltip com texto escapado
  (`escaparHtml`), porque o tooltip do ECharts é HTML.
- **Evolução mensal:** as mesmas 4 formas (linhas, área, barras agrupadas e
  empilhadas), com a troca entre elas animada. A legenda é clicável e liga/desliga
  a série.
- **Participação no total:** barras ou rosca, com a troca animada. Mostra as mesmas
  6 + "Outros" do gráfico mensal, com as mesmas cores (antes eram os 10 maiores).
- A animação **não** segue o "reduzir movimento" do sistema: o Windows liga esse
  sinal só por ter "Efeitos de animação" desligado, e os gráficos ficaram parados.
- Visual no estilo dos exemplos do ECharts: linhas suavizadas com degradê, barras
  crescendo em sequência, régua de zoom a partir de 7 meses, rosca com rótulos.
- **As Consultas continuam com o SVG próprio** (`consultas/grafico-evolucao.tsx`).
  Migrar depende da conferência visual desta tela.

Pendente: conferência visual (claro e escuro, celular) e publicar.
