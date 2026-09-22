# Plano: separar "chave de integração" e "código" em toda a integração

> **Status (22/09/2026): aprovado, em execução (escopo API + PRW).** Ver
> [Execução](#execução).
>
> Substitui a ideia de "`codigoErp` como chave única" de
> [`integracao-codigo-erp.md`](./integracao-codigo-erp.md), que é histórico.

## Nomenclatura

| Banco e JSON | Título na tela | O que é |
|---|---|---|
| `codigoErp` | **Código** | Código no ERP, informativo |
| `chave` | **Integração** | Mapeia o registro entre os dois sistemas (X2_UNICO com `-`) |

**São dois campos diferentes e independentes.** Um nunca é preenchido a partir
do outro: os dois vêm do Protheus, cada um no seu campo do JSON, com o mesmo
nome da coluna do banco.

## A regra

| Campo | Para que serve | Exemplo (cliente) |
|---|---|---|
| **chave** | Chave de integração: a chave única do Protheus (X2_UNICO), com `-` entre os campos. A plataforma usa **só ela** para decidir se cadastra, atualiza ou exclui, e para ligar um registro a outro | `-000001-01` |
| **codigoErp** | Só informativo | `00000101` |

Em tabela compartilhada a filial vem em branco, então a chave começa pelo `-`.

## Como fica cada tabela

**Toda tabela tem a sua `chave`, inclusive as de item.** O `codigoErp` existe
nas tabelas que são vistas sozinhas (cadastros e cabeçalhos). As tabelas de item
não têm `codigoErp`: o item só é visto dentro do seu documento.

**Cadastros**

| Tabela | chave | codigoErp |
|---|---|---|
| SZ1 Categoria | `Z1_FILIAL-Z1_TIPO` → `-12` | `Z1_TIPO` → `12` |
| SBM Subcategoria | `BM_FILIAL-BM_GRUPO` | `BM_GRUPO` |
| SZ0 Regra de desconto | `Z0_FILIAL-Z0_CODIGO` | `Z0_CODIGO` |
| SE4 Condição | `E4_FILIAL-E4_CODIGO` | `E4_CODIGO` |
| NNR Armazém | `NNR_FILIAL-NNR_CODIGO` | `NNR_CODIGO` |
| SB1 Produto | `B1_FILIAL-B1_COD` | `B1_COD` |
| SA3 Vendedor | `A3_FILIAL-A3_COD` | `A3_COD` |
| SA1 Cliente | `A1_FILIAL-A1_COD-A1_LOJA` | `A1_COD`+`A1_LOJA` |
| SA2 Fornecedor | `A2_FILIAL-A2_COD-A2_LOJA` | `A2_COD`+`A2_LOJA` |

**Mestre e detalhe: sempre juntos, nos dois sentidos**

Cabeçalho e itens são **sempre enviados e recebidos juntos**, numa mensagem só,
tanto do Protheus para a plataforma (DA0/DA1, SF2/SD2, SF1/SD1) quanto da
plataforma para o Protheus e na volta dele (orçamento → SC5/SC6). Não existe
envio nem rota de item avulso.

**Exclusão de item:** a consulta dos itens **não filtra `D_E_L_E_T_`**. O item
excluído no Protheus vai junto no envio, marcado `delete: true`, e a plataforma
o apaga. Item que não veio no envio é mantido. Isso vale também na carga
inicial: o `AND SD2.D_E_L_E_T_ = ' '` (e os equivalentes da DA1 e da SD1) sai
dos mapeadores. Marcar exclusão de um item que a plataforma nunca recebeu não
faz nada.

Na plataforma, o item fica ligado ao cabeçalho pelo vínculo interno que ela já
tem (item → cabeçalho). O item é localizado pela própria `chave`, dentro do
cabeçalho.

| Tabela | chave | codigoErp |
|---|---|---|
| DA0 Tabela de preço | `DA0_FILIAL-DA0_CODTAB` | `DA0_CODTAB` |
| DA1 Item da tabela | `DA1_FILIAL-DA1_CODTAB-DA1_CODPRO-DA1_ITEM` | — |
| SF2 Nota de saída | `F2_FILIAL-F2_DOC-F2_SERIE-F2_CLIENTE-F2_LOJA-F2_FORMUL-F2_TIPO` | `F2_DOC` |
| SD2 Item da nota de saída | `D2_FILIAL-D2_DOC-D2_SERIE-D2_CLIENTE-D2_LOJA-D2_COD-D2_ITEM` | — |
| SF1 Nota de entrada | `F1_FILIAL-F1_DOC-F1_SERIE-F1_FORNECE-F1_LOJA-F1_FORMUL-F1_TIPO` | `F1_DOC` |
| SD1 Item da nota de entrada | `D1_FILIAL-D1_DOC-D1_SERIE-D1_FORNECE-D1_LOJA-D1_COD-D1_ITEM` | — |
| SC5 Pedido (retorno) | `C5_FILIAL-C5_NUM` | `C5_NUM` |
| SC6 Item do pedido (retorno) | `C6_FILIAL-C6_NUM-C6_ITEM-C6_PRODUTO` | — |

**Outros**

| Tabela | chave | codigoErp |
|---|---|---|
| SE1 Título | `E1_FILIAL-E1_PREFIXO-E1_NUM-E1_PARCELA-E1_TIPO` | `E1_NUM` |
| SB2 Estoque | `B2_FILIAL-B2_COD-B2_LOCAL` | `B2_COD` |

## Referências entre registros

Um registro que aponta para outro manda a **chave** do outro, em campos
`…Chave`: `clienteChave`, `produtoChave`, `categoriaChave`, `vendedorChave`,
`condicaoPagamentoChave`, `tabelaPrecoChave`, `armazemChave`,
`fornecedorChave` e `regraDescontoChave`. Eles substituem os `…Codigo` de hoje.

## O que muda em cada ponta

**Protheus → plataforma (BJPLA003)**
- Cada mapeador manda `chave`, `codigoErp` e as referências `…Chave`.
- Correções nas chaves que o BJPLA003 monta hoje:
  - DA1: de `CODTAB-ITEM-CODPRO` para `CODTAB-CODPRO-ITEM`;
  - SF2 (e o XML da nota): entram `F2_FORMUL` e `F2_TIPO` depois da loja;
  - SD2: entra `D2_COD` antes do `D2_ITEM`;
  - SF1: entra `F1_TIPO` depois do `F1_FORMUL`;
  - SD1: passa a `…-LOJA-D1_COD-D1_ITEM`; saem `D1_FORMUL` e `D1_ITEMGRD`;
  - SB2: volta a `B2_FILIAL-B2_COD-B2_LOCAL`, desfazendo a inversão feita em
    22/09 no BJPLA003, na leitura do reprocessamento e na descrição do contrato
    e dos docs.
- Cada consulta passa a trazer os campos que entram na chave.
- Os itens (DA1, SD2, SD1) passam a ser lidos sem filtro de `D_E_L_E_T_`,
  inclusive na carga inicial. O excluído vai com `delete: true`.
- Registro incluído e excluído entre duas coletas gera duas mensagens: `POST` e
  depois `DELETE` (`U_BJTEVE`).

**API e banco**
- Coluna `chave` em todas as tabelas da integração, inclusive as de item, com a
  unicidade na `chave`. Tudo é buscado e ligado pela `chave`.
- `sincronizar-filhos` casa cada item do payload com o do banco pela `chave` do
  item, dentro do cabeçalho. Item com `delete: true` é removido, e item novo é
  criado já ligado ao cabeçalho.
- Correções no que já está feito:
  - sai o cálculo do `codigoErp` a partir da chave (`codigoDaChave`, em
    `apps/api/src/modules/integracao/common/chave-integracao.ts`). Sem
    `codigoErp` no JSON, o campo fica vazio;
  - a migration só copia o valor antigo para `chave` e não calcula mais o
    `codigoErp`. O `codigoErp` certo chega no próximo envio do Protheus;
  - no contrato, o campo `codigoErp` deixa de carregar a chave, e o `codigo`
    provisório some;
  - `codigoErp` passa a aceitar vazio em produto, categoria, condição, armazém
    e tabela de preço. `chave` é obrigatória em todo registro da integração.

**Telas**
- A coluna "Código" continua mostrando o `codigoErp`.
- Entra o campo **"Integração"** com a `chave`, **só na tela de visualização do
  registro**. Não entra nas listagens. É só leitura, porque quem define a chave
  é o ERP.

**Plataforma → Protheus (BJPLA004)**
- A plataforma devolve as chaves, e o Protheus tira a filial e o `-`
  (`U_BJSEMFIL`).
- Depois de gerar o pedido, o Protheus devolve `chave` e `codigoErp` do SC5 e,
  para cada item do orçamento, a `chave` do SC6 correspondente.

## Execução

Marcado conforme é feito. Aprovado em 22/09/2026, com escopo API + PRW.
Telas ficam para depois.

- [x] Schema: `chave` nos cabeçalhos, no estoque e nos itens. Nos itens a
      `chave` é única dentro do cabeçalho, e a coluna `codigoErp` sai.
- [x] Migration única `20260922150000_chave_integracao`, testada com `ROLLBACK`
- [x] Contrato: `chave`, `codigoErp` informativo e referências `…Chave`
- [x] API: serviços e controllers pela `chave`, e `sincronizar-filhos` dentro
      do cabeçalho
- [x] API: tirar a derivação `codigoDaChave`
- [x] API: `vincular` do orçamento com as chaves do SC5/SC6
- [x] Testes da API (378 passando; web compila)
- [x] BJPLA003: `chave`/`codigoErp`/`…Chave`, chaves corrigidas e itens sem
      filtro de `D_E_L_E_T_`
- [x] BJPLA004: leitura das `…Chave` e retorno do SC5/SC6
- [x] Documentação da integração (README, endpoints, swagger.md, testes-swagger.json, advpl/README e advpl/PLANO)

### Pendente após a execução

- [x] Teste de ponta a ponta em dev (22/09/2026, aprovado pelo usuário; as 5
      migrations pendentes foram aplicadas juntas). Conferido: categoria cria e,
      reenviada, atualiza o mesmo registro; sem `codigoErp` fica vazio; produto
      liga pela `categoriaChave` e chave inexistente dá 404; nota com 2 itens e
      reenvio com um item `delete: true` deixa só o outro, atualizado e ligado
      à nota; `DELETE` pela chave. Dados de teste removidos. **Não testado
      ponta a ponta:** o `vincular` do orçamento (SC5/SC6), coberto só pelos
      testes de contrato.
- [ ] Deploy: publicar as imagens e fazer o redeploy (a migration roda no boot
      da API).
- [ ] Protheus, pelo usuário: compilar BJPLA002, BJPLA003 e BJPLA004 e reenviar
      tudo (a chave dos transacionais mudou, e o `codigoErp` certo dos
      cadastros só chega no reenvio).
- [ ] Telas: campo "Integração" na visualização do registro (fora do escopo
      desta rodada).

## Teste por partes

Pedido do usuário em 22/09/2026: testar em produção, uma direção de cada vez.

### Parte 1 — recebimento do ERP (Protheus → plataforma)

Preparação:

- [x] Build de conferência da API (`nest build` no container de dev).
- [x] Publicar **só a API**: `.\publish.ps1 -Target api` (22/09/2026, digest
      `sha256:f25558831cb1…`). A imagem sai do working
      tree inteiro, então leva também o que ainda não tem commit (o trabalho do
      Evolution e a migration `20260921120000_evolution_advanced_settings`).
      Decisão do usuário em 22/09/2026: o Evolution vai junto.
- [x] Redeploy da stack `rcgcba` no Portainer. As migrations pendentes rodam no
      boot da API, com a `DATABASE_URL` do stack (precisa de DDL; ver runbook).
- [x] Conferido em 22/09/2026: `POST /integracao/categorias` com `chave` `  -03`
      e `codigoErp` `03` respondeu 201, gravando chave `-03` e código `03`.
- [x] Protheus: BJPLA002 e BJPLA003 compilados (o BJPLA004 é da parte 2).

Teste, na ordem de carga, conferindo na tela ("Código") e na resposta da API
(`chave` e `codigoErp`):

- [ ] Categorias (SZ1) e subcategorias (SBM): `chave` `-12`, `codigoErp` `12`,
      e a subcategoria ligada à categoria pai. As 2 categorias que já tinham
      subido antes recebem o `codigoErp` certo no reenvio.
- [ ] Regras de desconto, condições, armazéns, produtos, vendedores, clientes e
      fornecedores: `codigoErp` sem filial e sem `-`, e referências ligadas.
- [ ] Tabela de preço (DA0/DA1): cabeçalho e itens juntos, com a chave do item
      `FILIAL-CODTAB-CODPRO-ITEM`.
- [ ] Estoque (SB2): chave `FILIAL-COD-LOCAL`, `codigoErp` = `B2_COD`.
- [ ] Nota de saída (SF2/SD2), nota de entrada (SF1/SD1) e títulos (SE1).
- [ ] Exclusão de item: excluir um item de tabela de preço no Protheus e
      reenviar. O item some da plataforma, e os outros continuam.
- [ ] Incluir e excluir um registro entre duas coletas: a fila mostra `POST` e
      depois `DELETE` da mesma chave.

### Parte 2 — retorno para o ERP (plataforma → Protheus)

A detalhar depois da parte 1: pedido gerado do orçamento e chaves do SC5/SC6.

## Ordem de execução

1. Banco (migration, fundida na `20260922150000_chave_integracao`).
2. Contrato e API.
3. Protheus: BJPLA003 e BJPLA004.
4. Telas: campo "Integração".
5. Documentação: `docs/integração/README.md`, `endpoints.md`,
   `advpl/README.md` e `advpl/PLANO.md`.

## O que já está feito

Ainda sem commit, no working tree:

- **Banco dos 9 cadastros:** coluna `chave` (única por empresa). Migration
  `20260922150000_chave_integracao`, ainda não aplicada em produção.
- **API dos cadastros:** busca e liga pela `chave`. Os nomes no contrato e o
  cálculo do código entram nas correções acima.
- **Protheus:** `U_BJPARTES`, `U_BJSEMFIL` e `U_BJTEVE` criadas. As chaves
  foram alinhadas a uma lista anterior de X2_UNICO e passam pelas correções
  acima.

## Em aberto

Nada, por enquanto.

## Como vamos conferir

1. Testes automáticos da API.
2. Em dev: categoria `-12` cadastra e, reenviada, atualiza; produto com
   `categoriaChave -12`; exclusão; nota com itens.
3. No Protheus, pelo usuário: compilar BJPLA002/003/004, reenviar as
   categorias e gerar um pedido para conferir as chaves do SC5 e dos SC6.

## Fora deste plano

A rota `GET /integracao/clientes/alteracoes`, que o BJPLA004 chama e que não
existe na API.
