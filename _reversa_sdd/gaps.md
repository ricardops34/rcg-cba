# Lacunas e Pontos de Decisão (Gaps) — plataforma-comercial (rcg)

> Levantamento classificado de lacunas conforme nível de documentação detalhado.
> Categorias: **Crítica** (bloqueia reimplementação direta) · **Moderada** (comportamento com fallback) · **Cosmética** (formatação/interface).

---

## 1. Lacunas Críticas (Severidade Alta)

- **GAP-01: Sincronização Reversa de Pedidos ERP → Orçamento:**
  - *Descrição:* O fluxo atual exporta orçamentos aprovados para a tabela SC5 do Protheus via BJPLA003/API, mas não implementa rotina de reconciliação reversa se o pedido for modificado por faturistas no ERP.
  - *Referência:* `_reversa_sdd/orcamentos/design.md` e `_reversa_sdd/integracao/design.md`
  - *Ação requerida:* Validação com Ricardo via Pergunta 5 em `questions.md`.

## 2. Lacunas Moderadas (Severidade Média)

- **GAP-02: Parametrização da Janela de Comodato sem Consumo:**
  - *Descrição:* Valor fixado em 30 dias em `comodato-sql.ts`. Pode requerer flexibilidade por empresa em operações com ciclos de consumo bimensais.
  - *Referência:* `_reversa_sdd/clientes/design.md`
  - *Ação requerida:* Validação via Pergunta 1 em `questions.md`.

- **GAP-03: Expiração de Propostas Pendentes na Fila de Alterações:**
  - *Descrição:* Fila de aprovação de clientes não possui TTL de proposta pendente.
  - *Referência:* `_reversa_sdd/clientes/requirements.md`
  - *Ação requerida:* Validação via Pergunta 4 em `questions.md`.

## 3. Lacunas Cosméticas (Severidade Baixa)

- **GAP-04: Normalização Fonética de Bairros e Complementos:**
  - *Descrição:* `endereco-equivalente.ts` normaliza logradouro, cidade, UF e telefone, mas compara complemento e bairro por igualdade estrita após remoção de acentos.
  - *Referência:* `_reversa_sdd/clientes/design.md`
  - *Impacto:* Não afeta a integridade, gerando apenas raras propostas desnecessárias na fila quando o bairro possui grafias alternativas.

