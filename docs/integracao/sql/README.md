# Gerar os arquivos da carga inicial por SQL

Gera, direto do SQL Server, os arquivos JSON da carga inicial — as mesmas
linhas que os mapeadores do `BJPLA003` montam, sem passar pelo Protheus nem
pela SZZ. Um arquivo por entidade e, para notas e títulos, um por ano.

**Só gera os arquivos.** Não envia nada para a plataforma e **não altera
nenhum campo da base do Protheus**: só lê. O que o script cria (tabela
`BJ_CARGA_CONFIG`, views `BJ_<alias>`, procedures `BJ_CARGA_JSONL` e
`BJ_CARGA_ANOS`) fica no banco em que ele rodar — pode ser um banco separado.
Requer SQL Server 2016+.

**Situação (28/09/2026): escrito, não rodado.** Gere primeiro uma entidade
pequena (armazéns) e compare com o JSON de uma mensagem da SZZ (monitor →
Mensagens) antes de gerar tudo.

## Instalar (uma vez)

Abra [`01-instalar.sql`](01-instalar.sql), ajuste `@BANCO`, `@EMPRESA` e
`@FILIAL` no topo e rode. No fim ele mostra a configuração — confira:

- `FIL_<alias>`: a filial de cada tabela (o `xFilial`). Descoberta pelo que
  está gravado; corrija com `UPDATE dbo.BJ_CARGA_CONFIG` se alguma estiver
  errada.
- `ARMAZENS`, `TIPOS_TITULO`, `PERC_JUROS`, `PERC_MULTA`: lidos da SX6
  (`MV_BJAPI16`, `MV_BJAPI17`, `MV_RGC_PJUR`, `MV_RGC_PMUL`). Juros e multa
  sem parâmetro cadastrado ficam `0.02` — o padrão com que o BjBoletos os lê
  (`SuperGetMV(..., .T., '0.02')`).
- `BEN_*`: beneficiário do boleto, lido da `SYS_COMPANY`.
- `CORTE`: vazio lê tudo. Para o mesmo recorte do `MV_BJAPI14`, preencha
  **em UTC** (`AAAA-MM-DD HH:MM:SS`) — o servidor do Protheus está em UTC−4.
- As mensagens `campo X não existe - vai como nulo` são os campos que os
  mapeadores só leem quando existem.

Para ver as linhas de uma entidade no SSMS, sem gravar arquivo:

```sql
EXEC dbo.BJ_CARGA_JSONL 'armazens';
EXEC dbo.BJ_CARGA_JSONL 'titulos-receber', 2025;
```

## Gerar os arquivos

O `02` grava os arquivos no disco do **servidor do SQL Server**, chamando o
`bcp` pelo `xp_cmdshell`.

**1. Crie a pasta** no servidor SQL (padrão `C:\carga-bj`). A conta do serviço
do SQL Server precisa poder gravar nela.

**2. Ligue o `xp_cmdshell`** só durante a carga (precisa de login sysadmin):

```sql
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
```

**3. Ajuste o topo do `02` e rode** no mesmo banco em que rodou o `01`:

| Variável | Padrão | O que é |
|---|---|---|
| `@PASTA` | `C:\carga-bj` | Pasta de saída, no servidor SQL |
| `@EXECUTAR` | `1` | `1` grava os arquivos; `0` só lista os comandos `bcp` |
| `@SERVIDOR` | `@@SERVERNAME` | Instância que o `bcp` acessa |
| `@AUTENTIC` | `-T` | `-T` = conta do Windows; ou `-U usuario -P senha` |
| `@ENTIDADE` | `NULL` | Só uma entidade, ex.: `'titulos-receber'` |
| `@ANO` | `NULL` | Só um ano de notas e títulos, ex.: `2026`. Os cadastros saem sempre — notas e títulos dependem deles |

Para testar antes de gerar tudo: `@ENTIDADE = 'titulos-receber'`, `@ANO = 2025`.

**4. Confira o resultado.** O script devolve uma tabela com cada arquivo, a
quantidade de registros, `ok` (1 = gerado sem erro) e a saída do `bcp`.

**5. Desligue o `xp_cmdshell`:**

```sql
EXEC sp_configure 'xp_cmdshell', 0; RECONFIGURE;
```

Sem poder ligar o `xp_cmdshell`, rode com `@EXECUTAR = 0`: a coluna `comando`
traz um `bcp` por arquivo para colar num Prompt de Comando de qualquer máquina
com o `bcp` instalado.

Não use "Results to File" do SSMS para gerar os arquivos: ele corta linhas
longas (notas com muitos itens).

### Os arquivos

Um por entidade; notas e títulos, um por ano de emissão:

```
C:\carga-bj\regras-desconto.json
C:\carga-bj\categorias.json
C:\carga-bj\condicoes-pagamento.json
C:\carga-bj\armazens.json
C:\carga-bj\vendedores.json
C:\carga-bj\fornecedores.json
C:\carga-bj\produtos.json
C:\carga-bj\estoque.json
C:\carga-bj\tabelas-preco.json
C:\carga-bj\clientes.json
C:\carga-bj\notas-saida-2025.json
C:\carga-bj\notas-saida-2026.json
C:\carga-bj\notas-entrada-2026.json
C:\carga-bj\titulos-receber-2025.json
C:\carga-bj\titulos-receber-2026.json
```

A lista acima está na **ordem de carga** — a ordem em que a plataforma
precisa recebê-los (vendedor antes de cliente, cliente antes de título). Cada arquivo tem **um registro por
linha** (JSON Lines), em UTF-8, no formato do `POST /integracao/cargas`:

```json
{"entidade":"armazens","registro":{"chave":"01-01","codigoErp":"01","descricao":"ARMAZEM GERAL","ativo":true}}
```

O `registro` é o mesmo item que o `PUT /integracao/<entidade>` recebe.

## Enviar para a plataforma

Pela tela **Administração > Integração > aba Cargas por arquivo**:

1. Escolha a **chave de API** — os registros ficam em nome dessa integração.
2. Escolha **todos os arquivos de uma vez**. A tela os ordena pela ordem de
   carga (pelo nome do arquivo), compacta cada um e sobe um por vez.
3. Acompanhe na lista **Cargas recebidas**: situação, progresso, criados,
   atualizados e erros. Clique no número de erros para ver linha, chave e
   motivo de cada registro recusado.

A plataforma processa em segundo plano, um arquivo por vez, na ordem em que
chegaram, pelas mesmas regras da API de cada entidade. Não use o botão
"Importar TXT Protheus" para estes arquivos: ele espera outro formato de linha.

## Depois de gerar: data inicial da carga (`MV_BJAPI14`)

Para o job do Protheus (`U_BJVARRE`) **não refazer a carga inicial** que estes
arquivos já trazem, ajuste o `MV_BJAPI14` **no Configurador do Protheus**,
com o valor que o `02` mostra no fim (coluna `MV_BJAPI14`). O SQL só calcula e
mostra o valor; ele não grava o parâmetro:

```
MV_BJAPI14 = 2026-09-28 17:50:00      (exemplo)
```

É o início da geração menos 10 minutos, **em UTC** e no formato
`AAAA-MM-DD HH:MM:SS`, que o parâmetro aceita como está. Com ele, a carga do
job lê só o que foi incluído ou alterado depois da geração. Os 10 minutos lidos
de novo não duplicam nada: a API grava por chave.

Não use `DD/MM/AAAA` aqui: nesse formato o corte vira meia-noite do dia, e o
job reenviaria tudo o que mudou naquele dia antes da geração.

**Quando o parâmetro vale.** O `U_BJVARRE` só usa o `MV_BJAPI14` quando está
em carga inicial, ou seja, quando nenhum lote da SZY tem marca d'água gravada
(ou quando a SZZ não tem nenhuma mensagem de saída). Se já existir uma marca, ele
segue dela, e o parâmetro não muda nada. Para saber em qual caso você está:

```sql
SELECT TOP 5 ZY_CODIGO, ZY_STATUS, ZY_MARCA FROM SZY010
 WHERE D_E_L_E_T_ = ' ' AND ZY_MARCA <> ' ' ORDER BY ZY_CODIGO DESC;
SELECT ZZ_STATUS, COUNT(*) FROM SZZ010
 WHERE D_E_L_E_T_ = ' ' AND ZZ_TIPO = 'S' GROUP BY ZZ_STATUS;
```

**Mensagens que já estão na fila.** O parâmetro decide o que o job **coleta**
dali em diante. Não mexe no que já está na SZZ: mensagens pendentes (status
`1`) ou com erro (`3`) de uma carga anterior continuam saindo pelo envio.

## Diferenças conhecidas para o ADVPL

- **Dígito do nosso número:** vai o `E1_DACNOSS`; sem ele, nulo. O `U_DACBRA`
  do BjBoletos não foi reproduzido — a plataforma recalcula pelo módulo 11.
- **Números** saem como decimal com 6 casas (`10.500000`): mesmo valor, outra
  grafia.
- **Campo opcional que não existe** vai `null` em vez de ausente.
- **Vendedores:** a ordem é por nível na hierarquia (superior antes de quem
  responde a ele), não a ordem exata do `BJOrdSup` — as duas respeitam a mesma
  regra.
