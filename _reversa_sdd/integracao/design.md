# integracao — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `integracao`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Entidade (endpointKey)` | `Coleta` | `Envio ao ERP` | Particularidade |
| `categorias, armazens, condicoes-pagamento, fornecedores, vendedores` | `PUT/POST/PATCH/DELETE` | `—` | vendedor com `supervisorChave` e tipo `superior`; `usuarioId` nunca é tocado |
| `regras-desconto` | `idem` | `—` | valida faixas sem sobreposição; só uma regra padrão por empresa |
| `produtos` | `idem` | `—` | armazém: valor do ERP, senão `ARMAZEM_PADRAO`; fabricante inexistente vira `null` |
| `estoque` | `idem` | `—` | acha o saldo por `chave` **ou** por produto+armazém |
| `tabelas-preco` | `idem` | `—` | itens por `resolverProduto` (busca aproximada) |
| `clientes` | `PUT/POST direto; **PATCH vira solicitação**` | ``alteracoes`` | duas portas com regras diferentes (ver 4.4) |
| `titulos-receber` | `idem` | `—` | baixas filhas; dados do boleto; conta bancária por descrição |
| `notas-saida / notas-entrada` | `idem` | `—` | itens filhos; comodato por CFOP; XML na saída |
| `objetivos` | `idem` | `—` | objetivo por vendedor/mês |
| `orcamentos` | `idem` | ``pendentes` (+ `PATCH` vincular / erro)` | recalcula preço pela Tabela de Preço |
| `pedidos` | `POST/PUT/DELETE` | `—` | não é registro: atualiza o orçamento que gerou o pedido, ou cria histórico `origem=erp` |
| `equipamentos-comodato` | `—` | ``alteracoes` (+ `PATCH` aplicada)` | lista completa de aplicáveis; confirmação com versão (`alteradoEm`) |
| `comunicacao` | `POST` | `—` | batimento: grava `ULTIMA_COMUNICACAO_ERP` |
| `arquivo` | ``importar` (TXT/JSON)` | ``exportar`` | caminho legado, ver 4.2 e 4.3 |
| `cargas` | `POST de arquivo gzip/NDJSON` | `—` | processamento em segundo plano |

## Fluxo Principal

### 1. 3.1 Autenticação e medição — `ApiKeyGuard`

1. Header `x-api-key` ausente → 401. Chave = `itg_` + 30 bytes base64url; no banco só o
   **SHA-256** (`chaveHash`, único). Chave inexistente, `ativo=false`, `deletedAt` ou
   `expiraEm` vencido → 401.
2. Põe `request.integracao = {empresaId, apiKeyId}`; toda query dali em diante usa
   `withTenant(empresaId)` (a requisição por chave não leva contexto de RLS ao banco).
3. **Endpoint desativado** no monitor: o guard extrai o primeiro segmento depois de
   `/integracao/` (regex), lê `integracao_endpoint_configs` e responde 403 se `ativo=false`.
4. **Classificação do uso** (para o painel de status): *envio* = caminho contém
   `orcamentos/pendentes`, `clientes/alteracoes`, `equipamentos-comodato/alteracoes` ou
   `arquivo/exportar`; *comunicação* = `/integracao/comunicacao`; *coleta* = o resto que
   for POST/PUT/PATCH/DELETE, ou `arquivo/importar`. Grava `ultimoUso` (no máximo 1×/min) e
   `ultimaColeta`/`ultimoEnvio` (na primeira vez ou após 1 min), sem esperar (fire-and-forget).
5. Contador por endpoint (`totalChamadas`) em upsert fire-and-forget, com `warn` no log se falhar.

Todos os controllers declaram `@Throttle(60 req/min)` (por IP, via `ThrottlerGuard` global).

### 2. 3.2 Upsert por `chave` — `decidirUpsert` + `camposDaDecisao`

`chave` nova → **criar**; existe e ativa → **atualizar** com o payload inteiro; existe e excluída →
**reativar** (atualiza e zera `deletedAt/deletedBy`). Nunca 409. Todo service repete o mesmo
esqueleto: `findFirst({empresaId, chave})` (sem filtrar `deletedAt`) → resolve referências →
monta `dados` → `update`/`create` dentro de **uma** `withTenant`. Campo omitido no `PUT` vira
`null` (o ERP manda o registro inteiro); no `PATCH` `undefined` não mexe.

### 3. 3.3 Lote — `processarLote`

`PUT /integracao/<entidade>` com `{registros: [...]}` (1 a 1.000, `INTEGRACAO_LOTE_MAX`).
Aplica **em sequência, na ordem recebida** (dependência dentro do lote e para evitar deadlock
entre duas linhas da mesma chave). Cada item roda na **própria transação**; um erro vira
`{indice, chave, mensagem}` e o lote segue. Responde **200** com
`{processados, criados, atualizados, excluidos, erros[]}`. `excluido: true` faz soft delete e
dispensa os outros campos. A mensagem do erro é a de `response.message` do Nest (string ou array).

### 4. 3.4 Resolução de referências

`resolverCliente` e `resolverVendedor` aceitam: `chave` exata/aparada, `codigoErp`
(exato/aparado/sem hífens à frente), `chave` terminando em `-<código>`. `resolverProduto`
aceita `chave` ou `codigoErp` exatos e, **se nada casar, qualquer produto cuja `chave` ou
`codigoErp` *contenha* o texto** (sem ordenação). `normalizarChaveOpcional` trata `"01-"`
(filial + código em branco) como ausência. As demais referências (categoria, armazém,
condição, tabela, regra) são por `chave` exata.

### 5. 3.5 Filhos — `sincronizarFilhos` / `criarFilhos` / `consolidarFilhos`

Itens, baixas e faixas casam por `chave` **dentro do cabeçalho** (`@@unique([cabecalhoId, chave])`).
`delete: true` remove; ativo faz upsert; **ausente não é excluído** (o ERP manda tudo sem filtrar
`D_E_L_E_T_`). Repetição da mesma chave no payload: a versão ativa vence a excluída; duas ativas
diferentes → 400.

### 6. 3.6 Carga por arquivo

- **Recebimento** (`POST /integracao/cargas`, ERP; ou `POST /integracao-cargas`, tela com JWT +
  `integracao.cadastrar`): corpo `application/gzip` ou `application/x-ndjson` (parser `raw` de
  100 MB só nesses tipos, e só nessa rota — filtro em `main.ts` devolve 415 nas outras). Confere
  a estrutura **do arquivo inteiro** (cada linha JSON, entidade aceita, `registro` objeto; até 20
  problemas listados) e recusa o arquivo todo com 400 se falhar. Teto de 512 MB descompactado
  (`maxOutputLength`). Guarda o arquivo **compactado no banco** (`Bytes`) e responde 202.
  Do ERP entra como `recebida`; da tela como `aguardando` até `POST /processar`.
- **Processamento** (`CargasProcessador`, varredura de 15 s): para cada empresa sem carga rodando
  neste processo, `reservar` pega a mais antiga em `recebida`/`processando` por `createdAt`;
  `updateMany` condicional é a trava entre réplicas. `processando` com `updatedAt` recente impede
  as seguintes (ordem de dependência); parada há 10 min é tomada de volta (`tentativas++`);
  5 tentativas → `erro`.
- **Bloco**: linhas seguidas da mesma entidade, até 1.000. Cada linha passa pelo **mesmo schema Zod**
  do `PUT` (`aplicarBloco`); linha inválida vira erro da linha e o resto segue; os válidos vão ao
  `upsertLote` da entidade. Erros do bloco e o checkpoint (`ultimaLinha`, contadores) gravam na
  **mesma transação**. Cancelamento (`cancelarSolicitado`) é atendido no fim do bloco.
- **Operações da tela:** processar, reprocessar (volta para `recebida`, apaga erros, mesma
  `createdAt`), cancelar, excluir (só `aguardando` ou terminada), limpar por grupo.

### 7. 3.7 Filas de envio ao ERP

- **Orçamentos pendentes:** `chave = null`, `status = aprovado`, sem `erroIntegracao`, ordem de
  criação. `PATCH pendentes/:id` (vincular) grava a chave do SC5 e a de cada item (SC6) — só
  uma vez; 409 se já vinculado, não aprovado, chave repetida ou item de outro orçamento.
  `PATCH pendentes/:id/erro` tira da fila e grava o motivo.
- **Alterações de cliente:** itens `pendente` da `cliente_envios_erp`, só de cliente com chave e com
  ao menos um campo do de-para `CAMPOS_ENVIO_ERP`; devolve **só os campos aprovados**, com o
  valor **atual** do cadastro, vendedor/tabela/condição como chave e CNAE com máscara.
  `PATCH alteracoes/:id/aplicada` → `enviado` (409 se repetido).
- **Comodato:** devolve a lista completa e atual de aplicáveis; a confirmação leva `alteradoEm`
  (versão) e o `UPDATE` condicional impede engolir mudança posterior (409 → ler de novo).

### 8. 3.8 Pedidos

`pedidos` não tem tabela: acha o orçamento pela chave do pedido (`C5_FILIAL-C5_NUM`) e grava
`situacaoErp`, `comQuebra` (`pedidoTemQuebra` compara itens do orçamento e do pedido), `notasErp`,
`itensErp`. Sem orçamento (pedido digitado no ERP) cria um **histórico**: orçamento `origem=erp`,
`status=aprovado`, sem número de proposta, itens e preços como vieram, `createdAt` = emissão
(meio-dia UTC). Cliente sem vendedor ou vendedor inexistente → vendedor do cadastro do cliente.
Exclusão: orçamento da plataforma vira `situacaoErp=cancelado`; histórico do ERP sai (soft delete).

### 9. 3.9 Comodato por CFOP

`itemEhComodato`: item é comodato se o ERP informou **ou** o CFOP é 5908/6908 (saída) ou
1909/2909 (entrada). O cabeçalho é comodato se **todos** os itens vivos são (nota mista continua
venda). `recalcularComodatoDaNota` roda depois de gravar. A lista é a mesma da migration
`20261007030000_comodato_por_cfop`.

### 10. 3.10 Outras regras

- Duplicata (`F1_DUPL`/`F2_DUPL`): omitido não mexe; vazio = "não gerou" (`geraDuplicata=false`).
- Título: `nossoNumero`/`carteira`/linha digitável só dígitos; código de barras só se tiver **44**
  dígitos, senão `null` (e o título entra). Vendedor vazio/desconhecido → `null`, sem 404.
- Nota de entrada: armazém do item inexistente → item sem armazém; participante conforme `tipo`
  (devolução de venda aponta para **cliente**).
- Nota de saída: `tipo` de fornecedor (devolução de compra) aponta para fornecedor.
- Cliente `PATCH`: diff contra o estado atual via `ClienteAlteracoesService.registrar` com
  `aplicarDireto: false`; reenviar o mesmo cadastro não gera solicitação.
- Batimento `POST /integracao/comunicacao`: upsert do parâmetro `ULTIMA_COMUNICACAO_ERP`.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ClientesModule (ClienteAlteracoesService)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`modulo orcamentos (calculo, numeracao, validade)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`integracao-keys (catalogo de endpoints)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/integracao` | 🟢 |

## Estado Interno e Entidades

- **`IntegracaoApiKey`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`IntegracaoEndpointConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`IntegracaoCarga`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`IntegracaoCargaErro`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ClienteEnvioErp`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ComodatoEnvioErp`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

