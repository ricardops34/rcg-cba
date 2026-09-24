# Mapeamento da Integração Protheus (AdvPL) → BJ.Integrador (C# .NET)

Este documento descreve o mapeamento completo dos fontes AdvPL de referência (`referencia-advpl/`) para o novo serviço Windows em .NET 10 (`BJ.Integrador`), em conformidade com a Etapa 5.

---

## 1. Mapeamento de Fontes e Funções AdvPL

| Fonte AdvPL | Função Principal | Direção | Papel / Descrição |
|---|---|---|---|
| `BJPLA002.prw` | `U_BJCATALO` | N/A | Catálogo com a ordem de carga das 15 entidades da API REST |
| `BJPLA002.prw` | `U_BJHTTP` | N/A | Envelope do cliente HTTP (`FWRest` / `HTTPQuote`) |
| `BJPLA002.prw` | `U_BJENFILA` | N/A | Gravador de detalhe na fila `SZZ` |
| `BJPLA002.prw` | `U_BJGRAVA` | N/A | Atualizador de status e retorno da mensagem na `SZZ` |
| `BJPLA003.prw` | `U_BJVARRE` | ENVIO | Coleta registros atualizados por `S_T_A_M_P_` e enfileira na `SZZ` |
| `BJPLA003.prw` | `U_BJMAP*` | ENVIO | Mapeadores de payload JSON por entidade (Produtos, Clientes, Notas, etc.) |
| `BJPLA004.prw` | `U_BJDRENA` | ENVIO | Coleta lotes pendentes (`SZZ` status `'1'` ou `'3'`), envia via HTTP e grava retorno |
| `BJPLA004.prw` | `U_BJRETORNO` | RECEBIMENTO | Lê rotas de entrada (`/orcamentos/pendentes`, `/clientes/alteracoes`), cria pedidos/clientes no ERP e envia ACK |

---

## 2. Tabelas de Fila do Protheus (SZZ e SZY)

- **`SZY` (Mestre de Lotes)**:
  - `ZY_FILIAL`, `ZY_CODIGO` (PK do lote)
  - `ZY_STATUS`: `'1'` (Coletado / Aguardando Envio), `'2'` (Processado OK), `'3'` (Lote com Erros)
  - `ZY_MARCA`: Marca d'água em UTC `AAAA-MM-DD HH:MM:SS`
- **`SZZ` (Detalhe da Fila de Mensagens)**:
  - `ZZ_FILIAL`, `ZZ_CODIGO`, `ZZ_SEQUEN` (PK da mensagem)
  - `ZZ_TIPO`: `'S'` (Saída ERP -> Plataforma), `'E'` (Entrada Plataforma -> ERP)
  - `ZZ_ENTID`: Código da entidade (ex: `produtos`, `clientes`, `orcamentos-pendentes`)
  - `ZZ_CHVORI`: Chave de origem no Protheus
  - `ZZ_VERBO`: `POST`, `PUT`, `PATCH`, `DELETE`, `GET`
  - `ZZ_JSON`: Body JSON enviado/recebido
  - `ZZ_STATUS`: `'1'` (Pendente), `'2'` (Executada com Sucesso), `'3'` (Erro)
  - `ZZ_HTTP`: Código de status HTTP (ex: `200`, `429`, `500`)
  - `ZZ_RETORN`: Resposta/mensagem de erro
  - `ZZ_CHVDES`: ID devolvido pela plataforma

---

## 3. Reserva Atômica e Controle de Concorrência

- **Premissa Inegociável**: **PROIBIDO alterar a estrutura da SZZ/SZY ou do banco do Protheus.**
- O AdvPL não possuía um valor de status "processando" nativo na SZZ.
- **Solução no Serviço C# (`BJ.Integrador`)**:
  - A reserva atômica de lotes é feita exclusivamente na tabela própria **`integ.Controle`** no banco `BJ_INTEGRADOR`.
  - Chave composta: `(EmpresaId, Tabela, Recno)`.
  - Estados em `integ.Controle`: `PENDENTE`, `PROCESSANDO`, `PROCESSADO`, `ERRO`.
  - Transação atômica em SQL no `BJ_INTEGRADOR`:
    ```sql
    INSERT INTO integ.Controle (EmpresaId, Tabela, Recno, Status, Tentativas, InicioProcessamento, JobId, DataAlteracao)
    VALUES (@EmpresaId, @Tabela, @Recno, 'PROCESSANDO', 1, SYSDATETIME(), @JobId, SYSDATETIME());
    ```
  - Registros presos em `PROCESSANDO` por mais de `TimeoutProcessamentoMin` minutos (padrão 15 min) expiram e retornam automaticamente para retentativa.

---

## 4. Estruturas JSON e Mapeamento de Entidades

### Autenticação e Cabeçalhos
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `x-api-key: {CredencialCriptografada}` (descriptografada via `ICofreCredenciais`)

### Exemplos de Mapeamento (ENVIO):

1. **Produtos (`/integracao/produtos`)**:
   - `codigoErp`: `B1_COD` (Trim)
   - `descricao`: `B1_DESC` (Trim)
   - `unidadeMedida`: `B1_UM` (Trim)
   - `ativo`: `B1_MSBLQL != '1'`

2. **Clientes (`/integracao/clientes`)**:
   - `codigoErp`: `A1_COD + A1_LOJA`
   - `razaoSocial`: `A1_NOME` (Trim)
   - `nomeFantasia`: `A1_NREDUZ` (Trim)
   - `cnpjCpf`: `A1_CGC` (Apenas números)
   - `inscricaoEstadual`: `A1_INSCR` (Trim)

3. **Condições de Pagamento (`/integracao/condicoes-pagamento`)**:
   - `codigoErp`: `E4_CODIGO` (Trim)
   - `descricao`: `E4_DESCRI` (Trim)

---

## 5. Mapeamento de Parâmetros (`integ.Parametro`)

Os parâmetros legados do Protheus (`SuperGetMV`) são mapeados para a tabela `integ.Parametro` do banco `BJ_INTEGRADOR`:

| Parâmetro AdvPL Legado | Chave em `integ.Parametro` | Nível Padrão | Descrição |
|---|---|---|---|
| `MV_BJAPI01` | `BaseUrl` | Empresa | URL base da API (substituído por `integ.Empresa.BaseUrl`) |
| `MV_BJAPI02` | `ApiKey` | Empresa | Chave de API (criptografada em `integ.Empresa.CredencialCriptografada`) |
| `MV_BJAPI03` | `Ativo` | Empresa/Fluxo | Habilita a integração (substituído por `Ativo` em `Empresa`/`Fluxo`) |
| `MV_BJAPI04` | `TimeoutSeg` | Fluxo | Timeout em segundos (substituído por `integ.Fluxo.TimeoutSeg`) |
| `MV_BJAPI05` | `MaxRetentativas` | Fluxo | Limite de retentativas (substituído por `integ.Fluxo.MaxRetentativas`) |
| `MV_BJAPI06` | `EsperaRetentativaMs` | Empresa | Intervalo em ms entre retentativas |
| `MV_BJAPI08` | `PausaEntreRequisicoesMs` | Empresa | Intervalo em ms entre requisições HTTP |
| `MV_BJAPI09` | `TamanhoLotePutBloco` | Fluxo | Tamanho máximo do lote |
| `MV_BJAPI10` | `RecuoMarcaAguaDias` | Empresa | Dias de recuo da marca d'água em carga |
| `MV_BJAPI11` | `RetencaoMensagensDias` | Empresa | Dias para expurgo de logs e mensagens executadas |
| (Novo) | `TimeoutProcessamentoMin` | Empresa | Minutos para expirar registros presos em `PROCESSANDO` (padrão `15`) |

---

## 6. Proposta de Cadastro Inicial (`integ.Empresa`, `integ.Fluxo`, `integ.Parametro`)

### `integ.Empresa`:
- `EmpresaId`: `'01'`
- `Nome`: `'Empresa Protheus Filial 01'`
- `TenantId`: `'tenant-01'`
- `BaseUrl`: `'https://api.rcgcba.bjsoft.com.br/api/v1'`
- `AuthTipo`: `'ApiKey'`
- `Ativo`: `1`

### `integ.Fluxo`:
1. **`PRODUTOS_ENVIO`**:
   - `Direcao`: `'ENVIO'`, `TabelaFila`: `'SZZ010'`, `Endpoint`: `'/integracao/produtos'`, `Metodo`: `'POST'`, `Cron`: `'*/5 * * * *'`, `TamanhoLote`: `50`
2. **`CLIENTES_ENVIO`**:
   - `Direcao`: `'ENVIO'`, `TabelaFila`: `'SZZ010'`, `Endpoint`: `'/integracao/clientes'`, `Metodo`: `'POST'`, `Cron`: `'*/5 * * * *'`, `TamanhoLote`: `50`
3. **`ORCAMENTOS_RECEBIMENTO`**:
   - `Direcao`: `'RECEBIMENTO'`, `TabelaFila`: `'SZY010'`, `TabelaRetorno`: `'SC5010'`, `Endpoint`: `'/integracao/orcamentos/pendentes'`, `Metodo`: `'GET'`, `Cron`: `'*/2 * * * *'`, `TamanhoLote`: `100`

---

## 7. Perguntas e Pontos de Atenção para Validação

1. **Confirmação de Chaves de Filial**: O Protheus utiliza filiais por tabela (ex: `B1_FILIAL`, `A1_FILIAL`). Confirmamos que no SQL do Protheus deve-se aplicar o filtro `D_E_L_E_T_ = ' '` e que o prefixo de filial está contemplado no cadastro de cada empresa?
2. **Geração de R_E_C_N_O_ no Recebimento**: No recebimento (gravação em tabelas do Protheus), o próximo `R_E_C_N_O_` deve ser obtido via `MAX(R_E_C_N_O_) + 1` dentro de transação com lock na tabela destino. Confirmado?

---
*Fim do documento MAPEAMENTO.md*.
