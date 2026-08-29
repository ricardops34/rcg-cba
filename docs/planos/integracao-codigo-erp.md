# `codigoErp` como chave única da integração ERP ↔ plataforma

> **Plano de execução vivo.** Marque as etapas conforme forem saindo. O
> documento é auto-contido de propósito: dá para retomar o trabalho lendo só
> ele, sem depender da conversa em que foi decidido.
>
> Aberto em 2026-08-28. Dois repositórios envolvidos:
> **plataforma** `C:\VPS\rcg` · **ERP** `C:\VPS\protheusrcg` (fontes em
> `Portal/BJ/`).

## A regra, fechada

**`codigoErp` é a única chave que atravessa a fronteira.** O Protheus manda o
código natural do ERP e é por ele que a API decide criar ou atualizar. Em toda
tabela que o ERP endereça.

**O valor é opaco para a plataforma.** Quem escolhe o que vai nele é o ERP, em
cada endpoint. A API não interpreta, não monta, não desmonta e não valida
formato — só guarda, indexa e compara. Validação é tamanho e não-vazio.

**O uuid da plataforma é interno e nunca sai.** É ele que amarra produto ↔
estoque, preço, item de nota, item de orçamento. O ERP não conhece e não
recebe.

**Referência viaja por código; quem resolve é a API.** Chega `B2_COD` no
estoque → a API acha o produto pelo `codigoErp` → pega o uuid → grava ou
atualiza. Código não encontrado é erro no registro, nunca FK nula em silêncio.

**`POST` é upsert em todos os endpoints:**

| Situação | O que faz | Resposta |
|---|---|---|
| não achou `(empresaId, codigoErp)` | cria | `201` |
| achou ativo | atualiza com o payload inteiro | `200` |
| achou excluído | atualiza **e** limpa `deletedAt` — o ERP é a fonte da verdade | `200` |

O `409` sai do contrato de integração, e com ele o "POST → 409 → refaz PATCH"
do motor no Protheus. `GET`, `PATCH` e `DELETE` endereçam por `codigoErp` na
URL, inclusive nas transacionais (hoje usam `codigoLegado` numérico).

**Mestre-detalhe casa filho a filho por `codigoErp`**, em vez de apagar e
recriar o conjunto: o que não veio no payload é removido, e o uuid do item
sobrevive à alteração de uma linha da nota.

**`R_E_C_N_O_` não é chave em lugar nenhum** — nem nos transacionais, nem no
vínculo do pedido gerado.

**`codigoLegado` foi removido.** Era o id da linha no MySQL do portal antigo,
preenchido pelos scripts de import; o MySQL foi aposentado e os dados passam a
entrar só pela API. No orçamento, o significado da coluna ("já virou pedido no
ERP", que define a fila de `/integracao/orcamentos/pendentes`) passou para o
`codigoErp`, que recebe o número do Pedido de Venda.

**Estoque é a única entidade sem `codigoErp` próprio** — a chave continua sendo
`produtoCodigo` + `armazemCodigo`, que é exatamente o fluxo desenhado.

### O que cada endpoint recebe em `codigoErp`

O valor é escolhido no mapeador do lado Protheus, tabela por tabela. A
plataforma não interpreta nenhum deles — para ela é string opaca.

As partes são unidas por hífen, concatenadas **no próprio mapeador** — sem
função utilitária no meio. O envio (`BJIN120`) e a exclusão (`BJIN130`) montam
a mesma string, e é a tabela abaixo que garante isso: ela é a definição.

O item da nota não herda a chave do cabeçalho: monta a sua a partir dos campos
da própria SD2, que são o mesmo vínculo (`D2_DOC`/`D2_SERIE`) que a query já
usa para achar o item da nota.

**Cadastros — já em produção, sem mudança:**

| Endpoint | Origem | `codigoErp` |
|---|---|---|
| regras-desconto | SZ0 | `Z0_FILIAL`-`Z0_CODIGO` |
| categorias | SBM | `BM_FILIAL`-`BM_GRUPO` |
| condicoes-pagamento | SE4 | `E4_FILIAL`-`E4_CODIGO` |
| armazens | NNR | `NNR_FILIAL`-`NNR_CODIGO` |
| produtos | SB1 | `B1_FILIAL`-`B1_COD` |
| vendedores | SA3 | `A3_FILIAL`-`A3_COD` |
| clientes | SA1 | `A1_FILIAL`-`A1_COD`-`A1_LOJA` |
| tabelas-preco | DA0 | `DA0_FILIAL`-`DA0_CODTAB` |
| estoque | SB2 | `B2_FILIAL`-`B2_COD`-`B2_LOCAL` |

**Transacionais — definidas em 2026-08-28, uma a uma:**

| # | Endpoint | Origem | `codigoErp` | Exemplo |
|---|---|---|---|---|
| 1 | notas-saida | SF2 | `F2_FILIAL`-`F2_DOC`-`F2_SERIE`-`F2_TIPO`-`F2_ESPECIE` | `01-000012345-1-N-SPED` |
| 2 | notas-saida → itens | SD2 | `D2_FILIAL`-`D2_DOC`-`D2_SERIE`-`D2_ITEM` | `01-000012345-1-0001` |
| 3 | titulos-receber | SE1 | `E1_FILIAL`-`E1_PREFIXO`-`E1_NUM`-`E1_PARCELA`-`E1_TIPO` | `01-NF-000012345-A-NF` |
| 4 | orcamentos | SCJ | `CJ_FILIAL`-`CJ_NUM` | `01-000123` |
| 5 | orcamentos → itens | SCK | `CK_FILIAL`-`CK_NUM`-`CK_ITEM` | `01-000123-01` |
| 6 | tabelas-preco | DA0 | `DA0_FILIAL`-`DA0_CODTAB` | `01-001` |
| 7 | tabelas-preco → itens | DA1 | `DA1_FILIAL`-`DA1_CODTAB`-`DA1_CODPRO` | `01-001-11400443` |
| 8 | pedidos | SC5 | `C5_FILIAL`-`C5_NUM` | `01-000456` |
| 9 | pedidos → itens | SC6 | `C6_FILIAL`-`C6_NUM`-`C6_ITEM` | `01-000456-01` |
| — | objetivos | sem origem no ambiente | entidade inativa no catálogo | |

> **A tabela de preço muda de chave.** Hoje o mapeador manda `DA0_CODTAB` sem
> filial. Passa a levar a filial, como as demais — o `BJIN130` precisa mudar
> junto, senão o `DELETE` procura uma chave que o envio nunca criou.

> **Pedido não tem endpoint na plataforma.** Não existe model, tabela nem rota
> para Pedido de Venda. Hoje o SC5 só aparece no `BJIN210`, que **cria** o
> pedido a partir de um orçamento aprovado na plataforma e devolve o número no
> vínculo. Enviar pedido + itens exige criar a entidade do lado de lá.

### O caminho do documento no ERP

```
Orçamento (SCJ + SCK)  ──aprovado──▶  Pedido (SC5 + SC6)  ──faturado──▶  Nota (SF2 + SD2)
```

Os três sobem para a plataforma como entidades distintas, cada um com a sua
chave: um orçamento aprovado que virou pedido continua existindo como orçamento,
e o pedido faturado continua existindo como pedido. A plataforma não deduz um do
outro — quem os relaciona é o ERP, e por ora esse vínculo só existe no sentido
orçamento → pedido, via `PATCH /integracao/orcamentos/pendentes/{id}`.

**A filial da chave sai da coluna `*_FILIAL`.** `FWxFilial()` é usado apenas no
filtro SQL da tabela corrente. O `codigoErp` preserva o conteúdo dos campos que
compõem a chave, sem `AllTrim()`, e POST/DELETE montam exatamente a mesma string.

**Inclusões, alterações e exclusões percorrem a mesma varredura.** `S_T_A_M_P_`
seleciona o que mudou sem filtrar `D_E_L_E_T_`; o próprio mapeador devolve POST
quando `D_E_L_E_T_ = ' '` e DELETE quando `D_E_L_E_T_ = '*'`. Não existe uma
segunda detecção ou varredura exclusiva de registros apagados.

**O XML da NF-e vai nota a nota, logo após o envio.** Não dá para mandá-lo junto
com a nota: ele vai numa rota filha (`POST /integracao/notas-saida/{codigo}/xml`)
e tomaria `404` se subisse antes de a nota existir. O mapeador então declara uma
função de **pós-envio** no registro que devolve ao motor
(`{chave, payload, verbo, posEnvio}`), e o motor a chama depois de cada `POST`
bem-sucedido. O motor não sabe o que ela faz — só a chama com a chave e o
payload.

A varredura `?semXml=true` continua existindo, e não é redundante: nota enviada
antes da autorização na SEFAZ não tem XML no TSS naquele instante, e é essa
segunda passada que a alcança depois.

**Cabeçalho e itens saem numa leitura só.** O mapeador da nota faz uma query com
`LEFT JOIN` e quebra por documento, em vez de uma consulta para o cabeçalho mais
uma por nota para os itens. O filtro de alteração fica num `EXISTS`, no nível da
nota — se fosse na linha do JOIN, uma nota cujo item mudou voltaria com **só
aquele item**. Itens excluídos também entram no array com `delete: true`; a
plataforma apaga somente a linha identificada pelo `codigoErp` do item.

**Por que a nota leva filial, tipo e espécie.** A filial entra porque a chave de
API é por **empresa**, e uma empresa do Protheus tem várias filiais: duas
filiais emitindo a nota `000012345` série `1` cairiam no mesmo registro da
plataforma, e a segunda sobrescreveria a primeira sem erro nenhum. Tipo e
espécie entram porque separam documentos que compartilham numeração (normal,
devolução, beneficiamento). A chave da NF-e (`F2_CHVNFE`) foi descartada: só
existe depois da autorização, e nota em digitação ou denegada precisa subir
antes disso.
| estoque | SB2 | *sem chave própria* — `B2_COD` + `B2_LOCAL` na URL |

---

## Etapas

### Plataforma (`C:\VPS\rcg`)

- [x] **1. Schema Prisma.** `codigoErp String?` + `@@unique([empresaId, codigoErp])`
      em `NotaSaida`, `NotaSaidaItem`, `TituloReceber`, `Orcamento`,
      `OrcamentoItem`, `ObjetivoVendedorMes`, `ObjetivoVendedorCategoria`,
      `TabelaPrecoItem`. `codigoLegado` removido dos sete que o tinham.
      `npx prisma validate` passa.
      → `apps/api/prisma/schema.prisma`

- [x] **2. Migration.** Aditiva nas colunas novas, `DROP COLUMN` nas antigas.
      **Escrita, ainda não aplicada.**
      → `apps/api/prisma/migrations/20260828210000_integracao_codigo_erp/migration.sql`

- [x] **3. Contracts.** `codigoErp` obrigatório (`min(1).max(60)`) nos schemas
      de criação da integração, inclusive nos filhos — item de nota, item de
      orçamento, item de tabela de preço e meta por categoria. `codigoLegado`
      saiu dos contratos de integração e dos de tela; nas telas virou
      `codigoErp: string | null`. `*_EXAMPLE` atualizados (viram Swagger), e o
      payload de vínculo do orçamento agora recebe `codigoErp`.
      `npx tsc --noEmit` passa.
      → `packages/contracts/src/integracao.ts`, `nota-saida.ts`,
      `titulo-receber.ts`, `orcamento.ts`

- [x] **4. Helper de upsert.** `deveReativar()` lançava `ConflictException`
      quando o registro existia e estava ativo — era o que produzia o 409.
      Virou `decidirUpsert()`, decisão de três estados (`criar` / `atualizar` /
      `reativar`) sem exceção, mais `camposDaDecisao()`, que devolve o que
      acrescentar ao `update` (só a reativação limpa `deletedAt`). O arquivo
      passou a se chamar pelo que faz.
      → `apps/api/src/modules/integracao/common/decidir-upsert.ts`
      (era `reativar-excluido.ts`; 12 services importam)

- [x] **5. Services e controllers.** `create()` virou upsert nos 13 endpoints.
      Nas transacionais o parâmetro de rota deixou de ser `ParseIntPipe` sobre
      `codigoLegado` e passou a ser a string `codigoErp` — em
      `findOne`/`update`/`remove`, nas três rotas de XML das notas e no vínculo
      dos orçamentos. Mestre-detalhe casa filho a filho pelo `codigoErp` via
      `sincronizarFilhos()` (novo em `common/`), em vez de apagar e recriar o
      conjunto — o uuid do item sobrevive à alteração de uma linha.
      `npx tsc --noEmit` passa na API inteira.
      → `apps/api/src/modules/integracao/*/`,
      `common/sincronizar-filhos.ts`,
      `apps/api/src/modules/orcamentos/calcular-itens-orcamento.ts`
      (carrega o `codigoErp` do item até a gravação)

- [x] **6. Fila de orçamentos pendentes.** Filtra `codigoErp: null`; o PATCH de
      vínculo grava `codigoErp` (número do pedido). As três regras do vínculo
      seguem valendo: só uma vez, só aprovado, sem colidir com outro orçamento.
      → `apps/api/src/modules/integracao/orcamentos/`

- [x] **7. Telas.** As duas que liam `codigoLegado` passaram a ler `codigoErp`;
      `npx tsc --noEmit` passa no web.
      → `apps/web/src/app/(app)/crm/orcamentos/page.tsx`,
      `apps/web/src/components/crud/orcamento-form.tsx`

- [x] **8. Caminho do MySQL removido.** Os seis importadores, os scripts
      `import:*` do `package.json`, a dependência `mysql2`, o serviço `mysql` do
      compose de dev e o compose de importação saíram. `sync-ibge`,
      `enrich-cnae` e `seed-base` ficam — não têm nada com o legado.
      → `apps/api/prisma/import-*.ts`, `apps/api/package.json`,
      `docker/mysql*`, `docker/docker-compose.dev.yml`

- [x] **9. Documentação da API.** Chave, verbos, upsert, mestre-detalhe e a
      tabela de erros (o `409` por duplicidade saiu).
      → `docs/integração/README.md`, `endpoints.md`, `swagger.md`

- [x] **10. Migration aplicada** no Postgres de dev (`localhost:5433`):
      `codigoErp` existe nas 8 tabelas, `codigoLegado` não existe em nenhuma.

- [x] **10b. Smoke test** contra a API rodando, com chave de integração real.
      Tudo verificado e os dados de teste apagados depois:

      | Cenário | Resultado |
      |---|---|
      | `POST` produto novo | cria, `201` |
      | `POST` do mesmo `codigoErp` | **atualiza a mesma linha** (uuid idêntico), sem 409 |
      | `DELETE` + `GET` | soft delete, `GET` devolve `404` |
      | `POST` depois do delete | ressuscita a **mesma** linha com os dados novos |
      | Reenvio de tabela de preço | item alterado **manteve o uuid**, item ausente removido, item novo criado |

      Uma diferença do que eu tinha documentado: o `POST` devolve `201` também
      na atualização (o Nest não distingue). Documentei o comportamento real em
      vez de inventar o `200` — o corpo devolve o estado final, e o ERP trata
      qualquer 2xx como sucesso. Se você quiser `200` na atualização, dá para
      fazer, mas custa mudar a assinatura dos 13 services.

### ERP (`C:\VPS\protheusrcg`, `Portal/BJ/`)

- [ ] **11. Definir o `codigoErp` de cada mapeador** (tabela acima) e
      implementar. Hoje mandam `R_E_C_N_O_` em `codigoLegado`:
      `BJIN120.prw:128` (SF2), `:273` (SD2), `:441` (SE1), `:1077` (SCJ).
      → `Portal/BJ/BJIN120.prw`, `BJIN110.prw` (itens de tabela de preço)

- [ ] **12. Exclusões.** A chave do `DELETE` sai do `R_E_C_N_O_` e passa a ser
      a mesma do envio.
      → `Portal/BJ/BJIN130.prw` (coluna `lRecno` do catálogo, `:108`, `:180`, `:199`)

- [ ] **13. Vínculo do pedido gerado.** `SC5->(Recno())` → `C5_NUM`.
      → `Portal/BJ/BJIN210.prw:374`, `:802`

- [ ] **14. Motor.** Some o "POST → 409 → refaz PATCH": o POST já é upsert.
      → `Portal/BJ/BJIN002.prw` (`BJEnvia`, ~linha 300)

- [ ] **15. README da integração.** Seções "codigoLegado dos transacionais",
      "POST com fallback para PATCH" e a tabela de cobertura.
      → `Portal/BJ/README.md`

---

## Estado do banco quando isto começou

Os números abaixo são do Postgres de dev, e são o motivo de a base poder ser
limpa: tudo veio do import do MySQL, que foi aposentado.

| tabela | linhas | `codigoLegado` |
|---|---|---|
| notas_saida | 67.921 | 1 – 67.921 |
| notas_saida_itens | 170.200 | 1 – 170.200 |
| titulos_receber | 38.512 | 1 – 38.512 |
| tabela_preco_itens | 18.041 | 1 – 18.041 |

Como o ERP mandava `R_E_C_N_O_` nessa mesma coluna, a primeira carga teria
sobrescrito registros sem relação nenhuma com a nota enviada. É o bug que este
plano fecha.
