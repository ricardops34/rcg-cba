# Estimativa de valor — sistema completo (rcg)
Data: 2026-10-16. Estimativa educativa, não é laudo de avaliação nem aconselhamento fiscal/jurídico.

## Tamanho medido (git, sem node_modules)
| Item | Valor |
|---|---|
| Código escrito (TS+TSX+Prisma+AdvPL) | ~226 mil linhas |
| API (sem testes) | ~96 mil / Web ~79 mil / testes ~16 mil |
| Endpoints / modelos / migrations | 649 / 133 / 149 |
| Módulos de negócio | ~70 |
| Apps | api, web, portal-cliente, whatsapp-worker + 5 fontes AdvPL (Protheus) |

## Cenário 1 — Esforço (custo de reconstruir, R$150/h)
| Produtividade | Horas | Custo |
|---|---|---|
| Rápida (~300 linhas/dia) | ~5.600 | R$ 0,84 mi |
| Típica (~125 linhas/dia) | ~13.400 | R$ 2,0 mi |
| Conservadora (~60 linhas/dia) | ~28.000 | R$ 4,2 mi |

## Cenário 2 — Valor (preço de venda do ativo)
Sem receita recorrente comprovada, código vendido costuma sair a 25-50% do custo de reposição típico: **R$ 0,5 a 1,0 mi**.
Com clientes pagando assinatura, o preço passa a ser múltiplo da receita anual (SaaS B2B: ~2-4x ARR) e pode superar isso.

## Cenário 3 — Faixa de mercado (proposta)
Piso R$ 0,5 mi | alvo R$ 0,8-1,2 mi | teto R$ 2,0 mi (só com clientes e integração Protheus em produção).
