# Compras: notas de entrada, itens e cadastro de fornecedores

> **Entregue em 2026-09-08.** Esta página registra as decisões que a
> implementação assumiu — a documentação viva da API está em
> [`../integração/endpoints.md`](../integração/endpoints.md), e a regra de acesso
> em [`../regras-de-negocio.md`](../regras-de-negocio.md).

## Contexto

A plataforma só conhecia o lado da venda: `notas_saida` + `notas_saida_itens`
espelhando o que o ERP faturou, as Consultas apurando em cima disso, e
`/integracao/notas-saida` como porta de entrada do movimento. Do lado da compra
não havia nada — nem nota de entrada, nem cadastro de fornecedor.

Esta entrega fecha a outra metade: receber do ERP as notas de entrada com seus
itens e o cadastro de fornecedores, com o mesmo isolamento por empresa das
demais tabelas de negócio, e dar tela de consulta a quem tem permissão.

## As quatro decisões, fechadas com o usuário em 2026-09-08

### 1. Escopo v1 = espelho + API, sem consultas gerenciais

Entraram as tabelas, a API de integração e as telas de lista/detalhe. As
consultas de compras (por fornecedor, por produto, por categoria, evolução)
ficaram de fora **de propósito**: elas nasceriam sobre dados que ainda não
existem, e o formato certo só se descobre depois que o ERP começar a mandar
movimento de verdade. Quando forem feitas, o caminho está pronto — a
`ConsultaVendasView` e o `lib/consulta-export.ts` são genéricos, e o que falta
é o análogo de `common/vendas/venda-analitica.ts` para o lado da compra.

### 2. Fornecedor é espelho read-only

Como Notas de Saída e Títulos a Receber: entra e sai só por
`/integracao/fornecedores`, e a tela não tem incluir/alterar/excluir. Dar CRUD
criaria a pergunta sem resposta boa de o que fazer quando o Protheus reenviar
um fornecedor editado aqui — hoje o upsert simplesmente sobrescreve.

### 3. Acesso restrito a Administrador e Diretor

Ver a seção "Custo de compra não é para a equipe de venda" em
`docs/regras-de-negocio.md`. Em resumo: a nota de entrada carrega o custo, e
cruzada com a de saída entrega a margem de tudo que a equipe vende.

### 3b. A SF1 guarda dois documentos — e a devolução vai para o cliente

Fechado em 2026-09-08, ao conferir o mapeamento do Protheus. `F1_TIPO = 'N'` é
compra e o participante é um fornecedor; `F1_TIPO = 'D'` é **devolução de
venda**, e o participante é um **cliente** — mesmo saindo do mesmo par de campos
(`F1_FORNECE`+`F1_LOJA`) no ERP.

Daí `NotaEntrada` ter `fornecedorId` **e** `clienteId`, os dois nulos: só um vem
preenchido. Um campo único de "participante" economizaria uma coluna e custaria
a chave estrangeira — sem ela, o banco não garantiria que o código aponta para o
cadastro certo, e a consulta por cliente viraria comparação de texto.

Três decisões saíram daí:

- **Onde aparece:** aba própria "Devoluções" na Posição de Cliente, ao lado de
  Notas, Comodato e Títulos. Mesmo tratamento do comodato, e pelo mesmo motivo:
  não é venda, e misturar na aba de notas distorceria o "total comprado".
- **Não entra nas apurações.** Objetivos, Consultas e Dashboard continuam
  usando `NotaSaidaItem.vlrDev`, gravado na própria nota de venda. Somar as duas
  fontes contaria a mesma devolução duas vezes e derrubaria o realizado de todo
  mundo. `totalDevolvido` aparece no resumo da posição, mas **não** abate
  `totalComprado`.
- **Quem vê: quem já tem acesso ao histórico do cliente.** A aba segue a
  permissão da Posição de Cliente e o escopo de carteira — não a de
  `notas-entrada`. O vendedor da carteira vê que o cliente devolveu, e continua
  levando 403 na tela de Notas de Entrada. A devolução não carrega custo de
  compra; carrega o preço de venda que voltou, que ele já conhece.

### 4. Sem XML da NF-e de entrada

A saída guarda o XML porque a plataforma reimprime a 2ª via do DANFE para o
cliente (ver `segunda-via-danfe-boleto.md`). Na entrada, o documento é do
fornecedor e ninguém aqui o reimprime — guardar megabytes de arquivo que nada
lê seria custo sem uso. Se a necessidade aparecer, o molde é `nota_saida_xml`.

## O que foi construído

| Camada | Arquivos |
|---|---|
| Schema | `Fornecedor`, `NotaEntrada`, `NotaEntradaItem` em `apps/api/prisma/schema.prisma` |
| Migrations | `20260908153829_compras_fornecedores_notas_entrada` (DDL + RLS + GRANT), `20260908153900_perm_compras` (menu, rotina, permissão) |
| Contracts | `packages/contracts/src/fornecedor.ts`, `nota-entrada.ts`, e dois blocos em `integracao.ts` |
| API interna | `apps/api/src/modules/fornecedores/`, `notas-entrada/` — só `GET`, permissão `visualizar` |
| API de integração | `apps/api/src/modules/integracao/fornecedores/`, `notas-entrada/` — `GET`/`POST`/`PUT` lote/`PATCH`/`DELETE` |
| Catálogo | duas entradas em `MENUS`, em `MODULO.cadastros` |
| Web | `app/(app)/cadastros/fornecedores/`, `cadastros/notas-entrada/`, `components/compras/` |

Nada de infraestrutura nova na integração: `autorIntegracao`, `decidirUpsert`,
`processarLote` e `sincronizarFilhos` já existiam e foram reaproveitados como
estão.

## Detalhes que valem lembrar

**Duas datas na nota, e não uma.** `dtEmissao` é a do documento do fornecedor;
`dtEntrada`, a do recebimento da mercadoria. As duas raramente coincidem.
`ano`/`mes` derivam da **emissão**, para que a apuração de compra case com a de
venda, que também usa emissão.

**Os itens repetem `empresaId`/`fornecedorId`/`dtEmissao`/`ano`/`mes` do
cabeçalho.** É a mesma denormalização de `notas_saida_itens`, e pelo mesmo
motivo: a apuração por produto varre a tabela de itens, e o join com o cabeçalho
custa caro à toa na maior tabela do módulo.

**Sem escopo hierárquico de vendedor.** Notas de Saída recorta por
`cliente.vendedorId` (a carteira). Compra não tem carteira, e o recorte de quem
vê já é a permissão do perfil. O isolamento por empresa continua sendo a RLS,
via `withTenant`.

**Ordem de carga pela API:** fornecedores → notas de entrada. Produtos,
armazéns e condições de pagamento já existiam.

## Mapeamento do Protheus (confirmado em 2026-09-08)

As chaves entraram na tabela de `codigoErp` de
[`integracao-codigo-erp.md`](./integracao-codigo-erp.md), que é a definição que
o `BJIN120` (envio) e o `BJIN130` (exclusão) seguem:

| Endpoint | Origem | `codigoErp` |
|---|---|---|
| fornecedores | SA2 | `A2_FILIAL`-`A2_COD`-`A2_LOJA` |
| notas-entrada | SF1 | `F1_FILIAL`-`F1_DOC`-`F1_SERIE`-`F1_FORNECE`-`F1_LOJA`-`F1_FORMUL` |
| notas-entrada → itens | SD1 | `D1_FILIAL`-`D1_DOC`-`D1_SERIE`-`D1_FORNECE`-`D1_LOJA`-`D1_ITEM` |

**A chave da SF1 não leva o `F1_TIPO`**, por decisão do usuário. Consequência
conhecida: se existir uma compra `'N'` e uma devolução `'D'` com o mesmo
documento/série/participante/formulário, a segunda sobrescreveria a primeira no
upsert. Na prática o participante difere (fornecedor vs cliente), então a
colisão é improvável — mas está registrada aqui porque, se acontecer, ninguém
vai perceber: o upsert não reclama, só sobrescreve.

**O NCM saiu do item.** Ele é do produto (`B1_POSIPI` → `produtos.ncm`), e
repeti-lo na linha da nota criaria duas versões do mesmo dado.

**Os valores do cabeçalho, conferidos contra o SX3 do ambiente:**

| Coluna | Campo SF1 | Tipo | Título no dicionário |
|---|---|---|---|
| `vlrBruto` | `F1_VALBRUT` | N(14,2) | Vlr.Bruto |
| `vlrIcmsSt` | `F1_ICMSRET` | N(14,2) | ICMS Solid. |
| `vlrSeguro` | `F1_SEGURO` | N(15,2) | Vlr.Seguro |
| `vlrDespesa` | `F1_DESPESA` | N(15,2) | Vlr.Despesas |

`vlrSeguro` e `vlrDespesa` entraram na migration
`20260908184045_nota_entrada_seguro_despesa`. Ficam em colunas separadas porque
é assim que a SF1 os guarda — juntá-los num "outras despesas" impediria
conferir a nota da plataforma contra o documento do fornecedor.

## O que ficou pendente

- **Falta conferir SA2 e SD1 contra o SX3.** Da SF1 já foram confirmados chave,
  tipo, e os valores da tabela acima. Continuam derivados do padrão do Protheus:
  todo o cadastro de fornecedor (**SA2** — em especial se `celular` e
  `observacao` existem no ambiente, e se é preciso condição de pagamento padrão
  `A2_COND` e dados bancários) e os campos do item (**SD1** — em especial o
  `peso`, que aqui é coluna própria mas no Protheus costuma sair de
  `B1_PESO` × quantidade). Depois de a migration estar em produção, mudar coluna
  custa outra migration.
- **`D1_TES`** não foi modelado. Se o TES for necessário para separar entrada
  que movimenta custo da que não movimenta, ele entra como coluna do item.
- **Consultas gerenciais de compras** (decisão 1).
- **Títulos a pagar**, o financeiro do lado da compra, não foi pedido e não
  entrou.
