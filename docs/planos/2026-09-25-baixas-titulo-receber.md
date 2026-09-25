# Baixas do título a receber — juros, multa, desconto e abatimento

> **Status (25/09/2026): plataforma pronta, AdvPL não começou.**
> Lado da API implementado, compilando e com testes passando. Falta a migration
> rodar, o mapeador AdvPL e a tela.
>
> **Por onde começar:** [Passo 1](#passo-1--descobrir-onde-a-baixa-mora-nesta-base).
> Ele decide a forma do Passo 2, então não pule.

## O problema

Título baixado chega à plataforma sem **juros e multa recebidos**, sem
**desconto concedido** e sem **abatimento de impostos**. Do estado da baixa, o
`U_BJMAPTIT` manda hoje só:

| Campo enviado | Origem | O que é |
|---|---|---|
| `dtBaixa` | `E1_BAIXA` | Quando baixou |
| `saldo` | `E1_SALDO` | Zera na baixa total |
| `acrescimo` / `decrescimo` | `E1_ACRESC` / `E1_DECRESC` | Acréscimo/decréscimo **do título**, não da baixa — e num número só, sem separar juros de multa |

### Não reaproveite `jurosValorDia`, `multaValor` e `descontoValor`

Apesar do nome, eles **não são** valores realizados. São as *instruções do
boleto em aberto* — "importância por dia de atraso", "multa após o vencimento",
"desconto até o vencimento" — calculadas sobre `E1_SALDO` e preenchidas só
quando o título tem carteira, em
[`BJPLA003.prw:3574-3577`](../integracao/advpl/BJPLA003.prw#L3574-L3577).

O valor impresso no boleto que está na mão do cliente é esse. Escrever valor
realizado neles faz a 2ª via divergir do papel, e o cliente contesta no caixa.

## A decisão (25/09/2026)

**Tabela nova, espelho read-only.** A baixa nasce e morre no ERP: a plataforma
não cria, não altera e não estorna.

Tabela, e não colunas no título, porque um título aceita **baixa parcial**:
três pagamentos com datas, juros e descontos diferentes viram três linhas, e
somá-los no título perderia justamente o que se quer ver.

---

## Já pronto — lado da plataforma

| Camada | Arquivo | O que entrou |
|---|---|---|
| Schema | `apps/api/prisma/schema.prisma` | `model TituloReceberBaixa` + `baixas` em `TituloReceber` |
| Migration | `20260925150000_titulo_receber_baixas` | Tabela, índices, FKs, **RLS + policy + GRANT** na mesma migration |
| Contrato (integração) | `packages/contracts/src/integracao.ts` | `integracaoTituloReceberBaixaSchema`, e `baixas` no payload do título |
| Contrato (leitura) | `packages/contracts/src/titulo-receber.ts` | `tituloReceberBaixaSchema`, `baixas` opcional no título |
| Import | `integracao-titulos-receber.service.ts` | `montarBaixas` + `sincronizarFilhos` no upsert e no PATCH |
| Leitura | `titulos-receber.service.ts` | `baixas` no `findOne` (não na listagem: seriam N linhas por título) |

Verificado: `tsc` limpo em `apps/api` e `packages/contracts`, 84 testes passando
em `src/modules/integracao` e `src/modules/titulos-receber`.
**A migration ainda não rodou** e o import nunca recebeu dado real.

### O payload que o AdvPL tem que montar

`POST /api/v1/integracao/titulos-receber`, com `baixas` dentro do título:

```json
{
  "chave": "01-NF -000116067-A-NF ",
  "numero": "000116067",
  "valor": 1260.50,
  "saldo": 0,
  "dtBaixa": "2026-08-14T00:00:00.000Z",
  "baixas": [
    {
      "delete": false,
      "chave": "01-NF -000116067-A-NF -001",
      "data": "2026-08-14T00:00:00.000Z",
      "valor": 1260.50,
      "juros": 8.40,
      "multa": 25.21,
      "desconto": 0,
      "abatimento": 0,
      "impostosRetidos": 0,
      "motivo": "NOR",
      "historico": "Baixa por CNAB",
      "banco": "237",
      "agencia": "1108",
      "conta": "0630524",
      "ativo": true
    }
  ]
}
```

### Três regras que o mapeador precisa respeitar

**1. `valor` é o principal, não o total.** Os encargos vêm ao lado, cada um no
seu campo. O que entrou em caixa é
`valor + juros + multa - desconto - abatimento - impostosRetidos`, e a
plataforma **não recalcula** — quem fecha a conta é o ERP.

**2. Encargos sempre positivos.** O sinal está no nome do campo: desconto de
R$ 10 é `desconto: 10`, nunca `-10`.

**3. Estorno vem como `delete: true`.** A lista segue a regra de item das notas:
linha ausente do payload **não** é excluída. Baixa estornada que simplesmente
some da coleta ficaria para sempre na plataforma, mostrando ao cliente um
pagamento que não existe mais.

---

## Passo 1 — Descobrir onde a baixa mora nesta base

Rode [`docs/sql/2026-09-25-diagnostico-se5.sql`](../sql/2026-09-25-diagnostico-se5.sql)
(a pasta é gitignored, o arquivo fica só local). Ele responde quatro coisas,
nesta ordem.

### 1a. A base usa a família FKx?

A TOTVS reestruturou a SE5 numa família de tabelas:

| Tabela | O que guarda |
|---|---|
| `FK1` | Liquidações a receber |
| `FK2` | Liquidações a pagar |
| `FK3` | Impostos calculados |
| **`FK4`** | **Impostos retidos** — é aqui que mora o "abatimento de impostos" |
| `FK5` | Movimento bancário |
| **`FK6`** | **Valores acessórios** — juros, multa, desconto, acréscimo |

**Se as FKx existirem e tiverem linhas**, a baixa se lê por `FK1 + FK6 + FK4` e
a SE5 é espelho/legado. **Essa resposta decide todo o resto** — pare aqui e
releia o Passo 2 com ela na mão.

### 1b. Linhas por tipo, ou colunas de valor?

As duas convenções **coexistem** na SE5 — não é uma ou a outra:

- **Linhas:** uma baixa com juros e multa grava três movimentos, separados por
  `E5_TIPODOC`: `VL` principal · `JR` juros · `MT` multa · `DC` desconto.
- **Colunas:** a SE5 também tem `E5_VLJUROS`, `E5_VLMULTA`, `E5_VLDESCO`.

Somar as linhas **e** ler as colunas duplicaria o valor. A query 1 do SQL mede
qual das duas está populada nesta base.

### 1c. Onde está o abatimento de imposto?

Três lugares possíveis: `FK4`, linha de SE5 com tipo próprio, ou os campos de
retenção da SE1 (`E1_IRRF`, `E1_PIS`, `E1_COFINS`, `E1_CSLL`, `E1_ISS`,
`E1_INSS`). A query 3 do SQL diz quais existem e quais estão preenchidos.

### 1d. Como esta base marca o estorno

**Três estados diferentes, e filtrar só um deixa passar os outros:**

| Operação | O que marca |
|---|---|
| Cancelamento (FINA070 opção 5) | `E5_DTCANBX` preenchido, **`E5_SITUACA` fica vazio** |
| Exclusão (FINA070 opção 6) | `D_E_L_E_T_ = '*'` |
| Liquidação cancelada | `E5_SITUACA = 'C'` |

O filtro precisa dos três, e os três viram `delete: true`.

---

## Passo 2 — Escrever a leitura no `U_BJMAPTIT`

Arquivo: [`BJPLA003.prw`](../integracao/advpl/BJPLA003.prw), função
`U_BJMAPTIT` (linha 3238).

### Onde encaixar

- **A query da baixa** vai *antes* do `While` do cursor de títulos, junto da
  query principal (linha 3309). **Uma query só, com quebra por título** — não
  uma consulta por linha. O `BJMAPRGD` mostra o custo do padrão errado; o
  `BJMAPNFS` mostra o certo (quebra de cabeçalho).
- **O `oJson["baixas"]`** entra no laço, logo antes do `cVerbo := "POST"`
  (linha 3581).

### Esqueleto — SE5 com linhas por `E5_TIPODOC`

```advpl
// Ordenada pela chave do titulo + sequencia: o laco de fora anda junto com
// este cursor, sem reabrir query por titulo.
cQryBx := "SELECT E5_PREFIXO, E5_NUMERO, E5_PARCELA, E5_TIPO, E5_SEQ, "
cQryBx += "       E5_DATA, E5_TIPODOC, E5_VALOR, E5_MOTBX, E5_HISTOR, "
cQryBx += "       E5_BANCO, E5_AGENCIA, E5_CONTA, "
cQryBx += "       E5_SITUACA, E5_DTCANBX, SE5.D_E_L_E_T_ AS BX_DELETADA "
cQryBx += "  FROM " + RetSqlName("SE5") + " SE5 "
cQryBx += " WHERE ? = ' ' "
cQryBx += "   AND SE5.E5_FILIAL = ? "
cQryBx += "   AND SE5.E5_RECPAG = 'R' "
cQryBx += " ORDER BY E5_PREFIXO, E5_NUMERO, E5_PARCELA, E5_TIPO, E5_DATA, E5_SEQ "
```

Depois, por título, agrupe as linhas do mesmo `E5_DATA + E5_SEQ` numa baixa só:

| `E5_TIPODOC` | Campo do payload |
|---|---|
| `VL` | `valor` |
| `JR` | `juros` |
| `MT` | `multa` |
| `DC` | `desconto` |

**Não filtre o estornado na query.** Traga tudo e marque:

```advpl
lEstorno := !Empty((cAlsBx)->E5_DTCANBX) .Or. ;
            AllTrim((cAlsBx)->E5_SITUACA) == "C" .Or. ;
            !Empty((cAlsBx)->BX_DELETADA)

oBaixa["delete"] := lEstorno
```

Filtrar na query faria a baixa sumir do payload — e sumir **não apaga** nada na
plataforma: a linha ficaria lá para sempre.

### Esqueleto — SE5 com colunas de valor

Mesma query, sem o agrupamento: cada linha `VL` já é uma baixa, e
`E5_VLJUROS` / `E5_VLMULTA` / `E5_VLDESCO` vão direto para
`juros` / `multa` / `desconto`.

### Se a base usa FKx

`FK1` é o cabeçalho da liquidação, `FK6` traz os valores acessórios por
`FK6_IDFK6`, `FK4` traz o imposto retido. **Confirme a estrutura das três no
Configurador antes de escrever** — a documentação pública da TOTVS não abre para
leitura automática (HTTP 403) e o dicionário desta base não foi consultado.

### A chave da baixa

`chave` precisa ser **estável entre coletas** — é por ela que o
`sincronizarFilhos` casa a linha em vez de recriar. Sugestão: a chave do título
mais a sequência do movimento:

```advpl
cChvBx := cChvTit + "-" + AllTrim((cAlsBx)->E5_SEQ)
```

Se `E5_SEQ` não for estável nesta base, componha com `E5_DATA`. O que não pode é
a chave mudar entre uma coleta e outra: a baixa duplicaria.

### Coleta: nada a mudar

A baixa atualiza a SE1 (`E1_BAIXA`, `E1_SALDO`), então o `S_T_A_M_P_` do título
anda e ele é recoletado sozinho. **Não** precisa de entidade nova no catálogo
nem de gatilho próprio.

---

## Passo 3 — Aplicar e conferir

1. **Migration.** Sobe junto com o container (`prisma migrate deploy` no boot).
   Role dona (`plataforma`), nunca `plataforma_app` — ver
   [`runbook-operacao.md`](../runbook-operacao.md).
2. **Um título só.** No monitor, *Gerar* com a chave de um título que você sabe
   que teve juros ou multa, depois *Enviar*.
3. **Conferir o que chegou:** `GET /api/v1/integracao/titulos-receber` deve
   trazer `baixas` com os valores separados.
4. **Conferir a conta:** `valor + juros + multa - desconto - abatimento -
   impostosRetidos` tem que bater com o que entrou em caixa no ERP.
5. **Testar o estorno.** Cancele a baixa no ERP, colete de novo e confirme que a
   linha **sumiu** da plataforma (ou seja: chegou com `delete: true`).
6. **Testar baixa parcial.** Duas baixas no mesmo título têm que virar duas
   linhas, não uma soma.

---

## Em aberto

| # | Decisão | Quem decide |
|---|---|---|
| 1 | `impostosRetidos` fica como total, ou quebra por tributo (IRRF, PIS, COFINS, CSLL, ISS)? Depende do [Passo 1c](#1c-onde-está-o-abatimento-de-imposto) | Usuário |
| 2 | Tela que mostra o extrato da baixa — a API já devolve no `findOne`, nenhuma tela consome | Usuário |
| 3 | Título baixado ainda vale para 2ª via? Hoje `temBoleto` já exclui baixado; confirmar que continua certo com o extrato à vista | Usuário |

## Armadilhas registradas

- **Os campos do boleto não são os da baixa** — ver
  [o começo](#não-reaproveite-jurosvalordia-multavalor-e-descontovalor).
- **Somar linha `JR`/`MT` e ler `E5_VLJUROS`/`E5_VLMULTA` duplica.** Escolha uma
  convenção, a que o Passo 1b apontar.
- **Estorno tem três marcas**, e `E5_SITUACA` sozinho não pega o cancelamento.
- **Linha ausente do payload não é excluída.** Estorno precisa de `delete: true`.
- **Uma query, com quebra por título.** Consulta por linha derruba a coleta —
  ver [`2026-09-25-desempenho-integracao-advpl.md`](./2026-09-25-desempenho-integracao-advpl.md).
- **Rotina agendável abre com `U_BJAMBIENTE()`.** Agendamento do Schedule do
  tipo **Job** não traz ambiente, e `Local x := SuperGetMV(...)` é avaliado antes
  da primeira instrução — ver *Agendamento e ambiente* no
  [README da integração](../integracao/advpl/README.md).
