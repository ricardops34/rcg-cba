# Fluxograma de função — `SugestaoCompraService.paraCliente`

```mermaid
flowchart TD
    Start["paraCliente(empresaId, user, clienteId, query)"] --> F1[resolverEscopoVendedores]
    F1 --> F2["findFirst cliente: id + empresaId + deletedAt null + vendedorId in escopo se houver"]
    F2 --> F3{encontrado?}
    F3 -- não --> X1[404 Cliente não encontrado]
    F3 -- sim --> F4["meses = parametros.obterNumero(SUGESTAO_COMPRA_MESES, query.meses)"]
    F4 --> F5["desde = hoje - meses"]
    F5 --> F6[busca ClienteCnae do alvo, orderBy principal desc]
    F6 --> F7["cestaDoCliente: produtos distintos comprados desde a data (NOTA_DE_VENDA)"]

    F7 --> F8{"motivoInelegivel? (CPF ou sem CNAE)"}
    F8 -- sim --> V1["retorna vazio(aviso) — CPF/sem CNAE"]
    F8 -- não --> F9[clientesDoMesmoRamo]
    F9 --> F10{ramo null ou sem pares?}
    F10 -- sim --> V2["retorna vazio('nenhum outro cliente do mesmo ramo')"]
    F10 -- não --> F11{cestaAlvo vazia?}
    F11 -- sim --> V3["retorna vazio('sem compras no período')"]
    F11 -- não --> F12["buscarSemelhantes (restrito aos pares do ramo)"]

    F12 --> F13{semelhantes.length === 0?}
    F13 -- sim --> V4["retorna vazio('nenhum semelhante com compras no período')"]
    F13 -- não --> F14["produtosDosSemelhantes (exclui o que já está na cestaAlvo)"]

    F14 --> F15{produtos.length === 0?}
    F15 -- sim --> V5["retorna vazio('semelhantes não compram nada além do que o alvo já compra')"]
    F15 -- não --> F16["precosNaTabelaDoCliente(alvo.tabelaPrecoId, produtoIds)"]

    F16 --> F17["monta sugestoes[]: score = cobertura = clientes/total, valorMedio, evidencia"]
    F17 --> F18["anonimiza clientesSemelhantes: naCarteira=false vira sem id/razaoSocial/municipio/uf"]
    F18 --> R1["retorna SugestaoCompraResultado completo, aviso: null"]
```

**Pontos de atenção:**
- Transação com `timeout: 30_000` (30s) — maior que o padrão do Prisma (5s) porque a
  varredura de cesta (`cestaDoCliente`/`buscarSemelhantes`) cruza `notas_saida_itens`, a
  maior tabela da base.
- Cada "retorna vazio" (`V1`–`V5`) é um **diagnóstico diferente**, não uma lista vazia
  genérica — a tela e o agente de IA (consumidor via módulo exportado) mostram a frase
  exata como explicação de por que não há sugestão.
- `F9` (`clientesDoMesmoRamo`) roda **antes** de `F11` (checar se a cesta do alvo está
  vazia): um cliente sem ramo é rejeitado por `F10` mesmo que tenha comprado muito — a
  elegibilidade por CNAE tem prioridade sobre o histórico de compra.
- `F12` (`buscarSemelhantes`) é restrito aos `pares` do ramo (`restringirA`), mas dentro
  deles a busca por semelhança é sobre a **base inteira** desse ramo, não sobre a
  carteira do usuário — é o ponto em que "comparáveis fora da carteira" entram no
  cálculo (ver code-analysis §3.2).
- `F18` é a única barreira de anonimização desta função — ela acontece **depois** que o
  cálculo já usou os ids reais para agregar os produtos (comentário no código: "o cálculo
  acima precisou dos ids reais para agregar; quem está fora da carteira contribuiu para o
  padrão e volta sem identificação").
