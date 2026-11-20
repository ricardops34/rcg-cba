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
- Fora por ora: exportar PDF/Excel (as Consultas têm; dá para somar depois).
