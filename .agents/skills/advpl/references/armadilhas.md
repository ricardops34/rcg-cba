# Armadilhas conhecidas — AdvPL da integração BJ

Cada item custou um erro de verdade. Quando mexer no assunto, confira aqui
antes de escrever.

## Rotina automática e erro

- **Job não tem tela.** Em job, `MostraErro()` grava um `.log` no servidor e
  devolve só o nome do arquivo. Use `lAutoErrNoFile := .T.` (Private, antes da
  rotina) e leia o log com `GetAutoGRLog()` — são as mesmas linhas que o
  `MostraErro()` mostraria. O `BJLogAuto` (BJPLA004) junta as linhas em texto.
- **MVC guarda o erro no modelo.** `FWMVCRotAuto` (ex.: `CRMA980` para a SA1)
  nem sempre leva a recusa de validação ao `GetAutoGRLog()`: o motivo fica em
  `oModel:GetErrorMessage()` (array: [4] campo, [6] mensagem, [7] solução,
  [8] valor). Leia **antes** do `DeActivate()`/`Destroy()` — depois some. Ver
  `BJErroMVC` no BJPLA004.
- **`MV_MVCSA1` desligado** = `FWLoadModel("CRMA980")` devolve Nil.
- **Recover sem `Using`** perde a descrição do erro. `Recover Using oErr` e
  `oErr:Description` — mas o `Break()` manual chega sem objeto
  (`ValType(oErr) == "O"` antes de usar).

## Parâmetros

- **`GetMV`, não `SuperGetMV`.** `SuperGetMV` guarda cache: trocar o conteúdo só
  valia depois de reiniciar o AppServer (trocado em 25/09/2026). `GetMV` não
  tem padrão — o parâmetro precisa existir na SX6 (lista no README.md).
- Leia o parâmetro **uma vez, fora do laço**: `GetMV` dentro do laço é uma
  consulta ao SX6 por registro.

## Títulos e boleto (BjBoletos — `C:\VPS\protheusrcg\Financeiro\Boleto`)

- **`E1_PORCJUR` guarda a MULTA**, não juros: o BjBoletos grava nele o mesmo
  percentual do `E1_TXMULTA`. Percentual de juros não existe gravado na SE1.
- **Juros**: `E1_VALJUR` (o que foi impresso) → `E1_MORADIA` → só então
  saldo × `MV_RGC_PJUR` ÷ 10 por dia (`U_JRBOL`). **Multa**: saldo ×
  (`E1_TXMULTA` ou `MV_RGC_PMUL`) (`U_MTBOL`). Desde 09/10/2026 a plataforma usa
  só esses valores do título — o percentual da conta bancária não entra.
- Título **sem carteira** (dinheiro, PIX, depósito) não tem boleto: não mande
  dados de banco.

## Chaves e integração

- **A `chave` é FILIAL-CÓDIGO** (CON-008). Tabela compartilhada tem filial em
  branco: a chave fica `-CÓDIGO`, e a referência chega aparada.
- **Envio vazio é recusado.** O `BJPLA004` recusa alteração de cliente sem campo
  no de-para ("sem nenhum campo reconhecido"). Campo novo na plataforma só
  chega à SA1 se entrar no `aMapa` do `BJPLA004` **e** no `CAMPOS_ENVIO_ERP` da
  API.
- **CNAE principal** vai em `A1_CNAE` com a máscara do `CC3_COD`
  ("4711-3/02") e precisa existir na CC3. Secundários não vão (a SA1 padrão não
  tem onde guardar) — decisão em aberto com o usuário.

## Estrutura do código

- **`End` sozinho fecha `While`** nos fontes BJ. Ele também é aceito para outras
  estruturas — por isso um `EndIf` apagado não dá erro onde faltou, e sim onde a
  função acaba (`C2024 Unclosed control structures`).
- **Variável declarada e nunca usada** (`W0003`) num trecho de regra é sinal de
  bloco perdido, não de sobra: em 09/10/2026 a cópia do `G:` tinha as `Local` do
  filtro `MV_BJAPI17` sem o filtro. Compare com o repositório antes de apagar a
  declaração.
