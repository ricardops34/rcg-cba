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

## Gráficos com Nivo (2026-11-20)

Os gráficos desta tela usam o **Nivo** (`@nivo/line`, `@nivo/bar` e `@nivo/pie`
0.99.0, licença MIT), por decisão do usuário.

- **Primeiro foi tentado o Apache ECharts.** Na tela real, a troca linha → barras
  travou e sobraram só os pontos. Numa página isolada o ECharts funcionava, e a
  causa na integração não foi achada. O usuário achou o resultado pior que o SVG
  antigo e mandou trocar.
- **Animação por mola (react-spring):** as barras crescem ao abrir, agrupadas ↔
  empilhadas deslizam, linha ↔ área sobem as faixas e a rosca abre. A troca linha →
  barra muda de componente, então a barra nasce crescendo, sem transformar a linha.
- **Não desligar a animação por `prefers-reduced-motion`.** O Windows liga esse
  sinal só por ter "Efeitos de animação" desligado, e foi isso que deixou a primeira
  versão parada.
- **Cores:** `--viz-N` resolvidas para rgba (`components/graficos/tema-grafico.ts`),
  porque a mola interpola cor e não entende `var()` nem oklch.
- **Sem degradê:** o `linearGradientDef` com cor `inherit` sai preto nas barras e
  na área (conferido em print).
- **Tooltip e legenda são React,** então o nome vindo do ERP é escapado pelo
  próprio React. Clicar na legenda esconde ou mostra a série.
- **Participação no total:** barras ou rosca, com as mesmas 6 + "Outros" e as
  mesmas cores do gráfico mensal (antes eram os 10 maiores).
- **As Consultas continuam com o SVG próprio** (`consultas/grafico-evolucao.tsx`).

Conferido em print (claro e escuro, 4 formas, rosca, meio da animação) numa página
de teste com dados fictícios. Falta a aprovação do usuário na tela real, o commit
(só se aprovar) e publicar.
