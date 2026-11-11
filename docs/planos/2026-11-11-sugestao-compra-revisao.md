# Sugestão de compra — revisão do cálculo (clientes com CNAE e sem sugestão)

**Aberto em 2026-11-11.** Relato do usuário: vários clientes com CNAE ficam sem
sugestão de compra. Agora que a aba Sugestão do orçamento é aberta a todo
vendedor (commit `2e906937`), cliente sem sugestão é aba vazia na frente do
vendedor.

## Estado

- [x] Leitura do motor (`gerarLinhasParaCliente`, `clientesDoMesmoRamo`, lote).
- [x] Diagnóstico só leitura: [`sugestao-compra-diagnostico.sql`](sugestao-compra-diagnostico.sql),
      testado na base de dev (2 s).
- [ ] **Rodar o diagnóstico na produção** — a base de dev não serve: a RCG está
      lá sem nenhum CNAE gravado (cópia de 30/09, antes da carga de CNAE). O
      acesso `psql` à VPS ainda não está no runbook; pedir o comando ao usuário.
- [ ] Decisões abaixo (D1–D3).
- [ ] Implementar o que for decidido; recalcular o lote.

## Por que um cliente com CNAE fica sem sugestão (pelo código)

O lote passa só por cliente ativo, não bloqueado, CNPJ e com CNAE. Para cada
um, as saídas sem nenhuma linha gravada são, em ordem:

1. **Ninguém com o mesmo CNAE principal** — o par precisa ter como *principal*
   exatamente a mesma subclasse (7 dígitos). Mercearia `4712-1/00` e
   supermercado `4711-3/02` nunca se comparam; CNAE secundário do par não
   conta. Suspeita principal: com ~6.700 clientes espalhados em muitas
   subclasses, muita subclasse tem 0 ou 1 cliente.
2. **Pares sem compra na janela** (12 meses, `SUGESTAO_COMPRA_MESES`).
3. **Nenhum produto comprado por ≥ 2 pares** fora do que o cliente já compra,
   de categoria marcada como *usada* e que não seja comodato.
4. **Lote desatualizado** — a sugestão é gravada; CNAE que chegou depois do
   último "Calcular" (ex.: consulta à Receita em lote) não gera nada até
   recalcular. Não há recálculo automático.
5. **Lote que falhou por tempo** — o lote inteiro é uma transação com teto de
   15 min, cliente por cliente. Se não couber, termina "falhou" e não grava
   nada para ninguém. O diagnóstico lista o histórico das execuções.

O diagnóstico separa os clientes nas situações 1–4 por empresa e mede quantos
ganhariam pares se a comparação fosse por classe (5 dígitos) ou grupo (3).

## Decisões pendentes

- **D1 — Afrouxar o ramo em degraus?** Proposta: subclasse → classe → grupo
  (→ divisão), parando no primeiro nível com pelo menos N pares que compraram
  no período; o motivo gravado diz o nível ("clientes da mesma classe de
  atividade…"). Mexe na decisão de 2026-10-07 ("só o mesmo CNAE"), por isso
  precisa do usuário.
- **D2 — CNAE secundário do par conta?** Hoje só o principal do par.
- **D3 — Lote em blocos.** Gravar por cliente (ou por bloco) em vez de uma
  transação única, para um lote longo não perder tudo. Técnico; depende do
  histórico da produção mostrar falha por tempo.
