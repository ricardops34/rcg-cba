# sugestao-compra — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `sugestao-compra`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `listagem(empresaId, user, query)` | `filtros (`ativo`, `uf`, `municipio`, `vendedorId`, `bloqueado`, `search`) + paginação` | `1 linha por cliente com `ultimoCalculo`/`qtdSugestoes` (SQL raw com subquery agregada)` | Média |
| `calculadaDoCliente(empresaId, user, clienteId)` | `id do cliente` | `o que está gravado em `sugestoes_compra`, com preço **atual** da tabela` | Baixa |
| `gerarLinhasParaCliente(...) *(privado)*` | `cliente, janela de datas` | `linhas prontas para `createMany` (não grava)` | Alta — o motor determinístico, compartilhado por lote e individual |
| `gerarLote(empresaId, user, body)` | `escopo + faixa de código opcional` | `grava sugestões do recorte inteiro, apagando o anterior` | Alta — sequencial por cliente, transação de até 15 min |
| `iniciarLote/executarLote` | `mesmo body` | ``202` imediato; grava `SugestaoCompraExecucao` e roda `gerarLote` sem `await`` | Média — orquestração assíncrona + notificação |
| `gerarParaCliente(empresaId, user, clienteId, meses?)` | `1 cliente` | `recalcula e grava só este cliente; 400 se inativo/bloqueado` | Média |
| `excluirCalculo(empresaId, user, filtro)` | `1 cliente ou recorte (escopo + faixa)` | `apaga `origem: 'local'`; 409 se lote rodando` | Baixa |
| `ultimaExecucao(empresaId)` | `—` | `última `SugestaoCompraExecucao` da empresa, com nome do usuário` | Baixa |
| `clientesDoMesmoRamo/motivoInelegivel/clientesElegiveis *(privados)*` | `cliente/escopo` | `listas/motivos de elegibilidade reusados pelas funções acima` | Média |
| `buscarSemelhantes/produtosDosSemelhantes/cestaDoCliente/precosNaTabelaDoCliente *(privados)*` | `parâmetros de cálculo` | `os blocos de SQL que `paraCliente` e `gerarLinhasParaCliente` montam em cima` | Alta — SQL raw com CTEs (ver §3.3) |

## Fluxo Principal

### 1. 3.1 Elegibilidade: só CNPJ com CNAE, só o ramo como universo de comparação

`motivoInelegivel`: CPF (documento com 11 dígitos) ou cliente sem nenhum `ClienteCnae`
nunca recebe sugestão — decisão do usuário de 07/10/2026, documentada em comentário no
código: comparar com a base toda sugeriria produto sem ligação com a atividade.
`clientesDoMesmoRamo` define o universo: o CNAE **principal** do cliente (ou, sem
principal marcado, todos os CNAEs dele), e "do mesmo ramo" é qualquer cliente ativo da
**base inteira** (não só a carteira) cujo CNAE principal bate com um desses. Retorna
`null` quando o cliente não tem CNAE algum — sem atividade, não há com quem comparar.

### 2. 3.2 Escopo decide quem é identificado, não quem entra no cálculo

Comentário no topo da classe é explícito sobre a inversão: o **alvo** precisa estar na
carteira do usuário (consulta de cliente alheio continua vedada), mas os **comparáveis**
vêm da base inteira — "a semelhança por ramo diz muito mais com 800 clientes do que com
os 60 de uma carteira, e o que se entrega são produtos, não clientes". O corte acontece
na **saída**: em `paraCliente`, cada `clienteSemelhante` fora da carteira
(`naCarteira: false`) volta anonimizado (`clienteId: ''`, sem razão social, sem
município) — contribuiu para o padrão sem ser revelado. Em `produtosDosSemelhantes`, a
evidência (`ARRAY_AGG` de razão social) só nomeia quem está em `daCarteira`; quem está
fora vira a contagem agregada `outrosClientes` ("+N cliente(s) do mesmo perfil em outras
carteiras"). Comentário de alerta no código: todo campo novo acrescentado a
`clientesSemelhantes` precisa passar pelo mesmo corte, ou vaza identidade de cliente de
outra carteira.

### 3. 3.3 Score de semelhança — dois eixos combinados, com peso de hierarquia de CNAE

`buscarSemelhantes` roda uma única consulta SQL com CTEs (`cestas`, `medidas`,
`cnae_alvo`, `cnae_pares`, `cnae_medidas`) e calcula em JS por cima:

- **Eixo cesta** (peso 0,6): índice de **Jaccard** entre os produtos comprados por cada
  par de clientes (interseção / união) — penaliza naturalmente o cliente que compra de
  tudo e por isso "parece" com todo mundo.
- **Eixo CNAE** (peso 0,4): dois sub-casos —
  - Subclasse idêntica (`nivel = 'subclasse'`): fórmula fixa `min(afinidade*0.65 + 0.35
    se mesmo CNAE principal, 1)`, onde `afinidade` satura em 3 CNAEs em comum (`min(n,3)/3`)
    — comentário explícito: esta fórmula **não pode mudar** quando a comparação por
    hierarquia foi introduzida (25/08/2026), senão a regra nova invalidaria scores que a
    regra antiga já validava.
  - Ramo vizinho (classe/grupo/divisão, só quando `afinidadeCnae: 'hierarquica'`):
    `PESO_NIVEL_CNAE[nivel] * TETO_VIZINHO (0.2)` — teto calculado para nunca ultrapassar
    o piso do caso exato (0,217), garantindo que "mesmo ramo" sempre vença "ramo
    parecido". Decisão de 25/08/2026 documentada no contrato: a regra antiga (só
    subclasse idêntica) ignorava 90 mil pares de clientes que a RCG mediu como do mesmo
    ramo em nível de classe.
- **Desempate por região** (+0,05 fixo): mesmo município/UF do alvo — só desempata,
  nunca promove cliente de outro ramo.
- `baseSemelhanca` (`'ambos'`/`'cesta'`/`'cnae'`) zera um dos dois pesos para permitir
  isolar o eixo na tela (comparação de resultados).
- Linhas sem nenhuma afinidade (sem produto em comum **e** sem CNAE em comum) são
  descartadas antes do score — "não é pouco parecido, é outro negócio".
- Top-K (`query.semelhantes`, 3–100) depois de ordenar por score desc.

### 4. 3.4 `gerarLinhasParaCliente` — o motor gravado, espelho do ao vivo com uma diferença

Compartilhado por `gerarLote` e `gerarParaCliente`, mas **não** é o mesmo código de
`buscarSemelhantes`: usa `Jaccard` puro (sem o eixo CNAE) para escolher os K clientes de
referência dentro do ramo — citação do código: "o resultado são produtos, não clientes,
então o CNAE já fez seu papel ao definir o ramo; dentro dele, só a cesta decide quem é
referência". Sem compra do alvo no período, ou sem ninguém do ramo com produto em comum,
a referência vira o **ramo inteiro** (`porCompra = false`), e o `motivo` gravado muda de
texto para refletir isso. Produto sugerido precisa de no mínimo `min(2, total)`
compradores na referência — salvo quando a referência tem 1 ou 2 clientes — para não
gravar idiossincrasia de um único cliente como padrão.

### 5. 3.5 "O que conta como venda" — mesmo critério do Dashboard e das Consultas

A constante SQL `NOTA_DE_VENDA` (nota ativa, tipo `'N'`, sem comodato, **e com
financeiro** — `geraDuplicata = true`, ou `null` com `condicaoPagamentoId` preenchido,
critério de fallback para integrações antigas) e `PRODUTO_VENDAVEL` (categoria marcada
como usada, sem ser equipamento de comodato) são reaproveitadas de
`common/vendas/venda-analitica.ts`/Dashboard, citadas explicitamente no comentário — a
cesta de compras tem que concordar com o que as outras telas chamam de venda, senão o
vendedor vê números que não batem entre telas.

### 6. 3.6 Lote: substituição por **recorte inteiro**, não por quem foi recalculado

`gerarLote` apaga a sugestão anterior de **todo o recorte elegível** (escopo + faixa de
código, `recorteInteiro: true` em `clientesElegiveis` — inclui inativo/bloqueado/sem CNAE,
não só quem passou no filtro de elegibilidade), não só de quem recebeu linha nova.
Racional: cliente que deixou de ser elegível (virou CPF, perdeu o CNAE, foi bloqueado)
não pode continuar com a sugestão de um cálculo antigo. Rodar só a faixa "004000 a
004999" não apaga quem está fora da faixa. Processamento é **sequencial** por cliente, de
propósito (comentário explícito): cada cliente já dispara uma varredura pesada sobre a
base inteira — em paralelo isso satura o pool de conexões do Postgres sem acelerar nada,
porque a base comparada é a mesma para todo mundo.

### 7. 3.7 Lote em segundo plano: 202 imediato, execução sem `await`, notificação no fim

`iniciarLote`: antes de criar a execução, marca como `falhou` qualquer execução que
ficou `rodando` além de `TEMPO_MAXIMO_LOTE_MS + 5min` (a API reiniciou no meio) — sem
isso, uma execução travada em `rodando` bloquearia a empresa para sempre, já que uma
única execução por empresa é garantida por índice parcial único da migration (não por
checagem em código; colisão gera `P2002` → 409). O disparo do trabalho real
(`executarLote`) é **sem `await`** (comentário: "é isto que tira o cálculo da
requisição") — o controller responde 202 na hora, e a tela acompanha por
`ultimaExecucao`. Sucesso ou falha, o fim sempre grava `SugestaoCompraExecucao` e cria
uma `Notificacao` (`sugestao_compra_calculada`) para quem pediu; a notificação falhando
é logada e engolida (`.catch`), para não derrubar o fluxo principal.

### 8. 3.8 `anonimizar.ts` — fronteira de dados para a IA, preparada mas não conectada

Arquivo isolado, pequeno de propósito (comentário explícito: "é aqui que a regra pode ser
quebrada sem ninguém notar"). Monta um payload com **só códigos opacos** (`C0`, `C1`...
+ códigos de CNAE/produto) para uma eventual consulta de semelhança via IA — nunca razão
social, CNPJ, endereço, valores ou descrição. `garantirPayloadAnonimo` é uma segunda
barreira em runtime: varre o JSON serializado atrás de qualquer chave da lista
`CAMPOS_PROIBIDOS` e lança em vez de enviar. Testado exaustivamente
(`anonimizar.spec.ts`, 8 casos). **Porém**: nenhuma função deste service (`paraCliente`,
`gerarLinhasParaCliente` etc.) chama `montarPayloadAnonimo`/`garantirPayloadAnonimo` —
toda a sugestão hoje roda pelo motor determinístico (`origem: 'local'`); `origem: 'ia'`
existe no enum do Prisma e no schema (`sugestaoCompraCalculadaItemSchema.origem`), mas
sem produtor. O arquivo é citado como precedente pelo módulo `agente`
(`anonimizar-agente.ts`), que aplica a mesma regra no chat do agente de IA — ver esse
módulo (não analisado nesta passada) para o consumidor real do padrão.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService (SUGESTAO_COMPRA_MESES)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverEscopoVendedores (common/escopo/escopo-vendedores)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`condicaoBuscaTermosSql (common/busca/termos-busca)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverTabelaPrecoCliente (common/precos)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts (PESO_NIVEL_CNAE)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`notas_saida_itens/notas_saida (SQL raw, modulo notas-saida)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`cliente_cnaes/cnaes (SQL raw)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Notificacao (modulo notificacoes)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `TEMPO_MAXIMO_LOTE_MS`:** timeout da transação do lote e janela de "execução travada" em `iniciarLote` | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `TETO_VIZINHO`:** teto do sinal de ramo vizinho — ver §3.3 | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `PESO_NIVEL_CNAE (@plataforma/contracts)`:** peso por nível de parentesco hierárquico de CNAE | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `NIVEL_CNAE`:** traduz o `MAX(nivel)` numérico do SQL para o nome | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `parâmetro SUGESTAO_COMPRA_MESES (ParametrosService)`:** janela de histórico quando a query não informa `meses` | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `sugestaoCompraQuerySchema defaults`:** parâmetros ajustáveis da consulta ao vivo | `apps/api/src/modules/sugestao-compra` | 🟢 |
| **Constante Parametrizada `CAMPOS_PROIBIDOS (anonimizar.ts)`:** lista de bloqueio da barreira em runtime (§3.8) | `apps/api/src/modules/sugestao-compra` | 🟢 |

## Estado Interno e Entidades

- **`SugestaoCompraGerada`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`SugestaoCompraExecucao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

