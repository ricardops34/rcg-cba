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
      lá sem nenhum CNAE gravado (cópia de 30/09, antes da carga de CNAE).
      O usuário roda e manda o resultado (decisão de 2026-11-11).
- [x] **D1 decidido (2026-11-11): ampliar em degraus.** Implementado em
      `clientesDoMesmoRamo`, com `sugestao-compra-ramo.spec.ts` (7 cenários).
      Não testado com dados reais (dev sem CNAE da RCG). Commitado, não publicado.
- [ ] Depois de publicar: **recalcular o lote** (Sugestão de compra →
      Calcular), senão nada muda para quem já estava sem sugestão.
- [ ] D2 e D3: decidir com o resultado do diagnóstico.

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

- **D1 — Afrouxar o ramo em degraus? → SIM (2026-11-11).** Subclasse (7
  dígitos) → classe (5) → grupo (3), parando no primeiro nível com pelo menos
  5 clientes (`MIN_PARES_RAMO`) que compraram no período. Nenhum chega a 5:
  vale o mais amplo com algum comprador. Divisão (2) fica de fora. O motivo
  gravado diz o nível: "… clientes da mesma classe de atividade (CNAE
  5611-2) compram este produto". Amplia a decisão de 2026-10-07 ("só o
  mesmo CNAE"). Vale também para a consulta ao vivo (tela e assistente).
- **D2 — CNAE secundário do par conta?** Hoje só o principal do par.
- **D3 — Lote em blocos.** Gravar por cliente (ou por bloco) em vez de uma
  transação única, para um lote longo não perder tudo. Técnico; depende do
  histórico da produção mostrar falha por tempo.
