# integracao — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `integracao`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

**API pública de integração com o ERP (Protheus), por chave de API, nunca por JWT.** Faz dois
trabalhos:

1. **Coleta** — o ERP empurra cadastros e movimento para a plataforma (`PUT` em lote, `POST`/`PATCH`/
   `DELETE` unitários, carga por arquivo, importação TXT). Regra fechada: **o ERP é a fonte da
   verdade** e todo `POST`/`PUT` é um *upsert* pela `chave`.
2. **Envio** — a plataforma devolve ao ERP o que nasceu ou mudou aqui, em três filas: orçamentos
   aprovados sem pedido (`orcamentos/pendentes`), alterações de cliente aprovadas
   (`clientes/alteracoes`) e equipamentos de comodato (`equipamentos-comodato/alteracoes`),
   cada uma com confirmação por `PATCH`.

## Responsabilidades

- **API pública de integração com o ERP (Protheus), por chave de API, nunca por JWT.** Faz dois
trabalhos:

1. 🟢
- **Coleta** — o ERP empurra cadastros e movimento para a plataforma (`PUT` em lote, `POST`/`PATCH`/
   `DELETE` unitários, carga por arquivo, importação TXT). 🟢
- Regra fechada: **o ERP é a fonte da
   verdade** e todo `POST`/`PUT` é um *upsert* pela `chave`. 🟢
- **Envio** — a plataforma devolve ao ERP o que nasceu ou mudou aqui, em três filas: orçamentos
   aprovados sem pedido (`orcamentos/pendentes`), alterações de cliente aprovadas
   (`clientes/alteracoes`) e equipamentos de comodato (`equipamentos-comodato/alteracoes`),
   cada uma com confirmação por `PATCH`. 🟢

## Regras de Negócio

- **RN-INTE-01 (3.1 Autenticação e medição — `ApiKeyGuard`):** 1. Header `x-api-key` ausente → 401. Chave = `itg_` + 30 bytes base64url; no banco só o 🟢
- **RN-INTE-02 (3.2 Upsert por `chave` — `decidirUpsert` + `camposDaDecisao`):** `chave` nova → **criar**; existe e ativa → **atualizar** com o payload inteiro; existe e excluída → 🟢
- **RN-INTE-03 (3.3 Lote — `processarLote`):** `PUT /integracao/<entidade>` com `{registros: [...]}` (1 a 1.000, `INTEGRACAO_LOTE_MAX`). 🟢
- **RN-INTE-04 (3.4 Resolução de referências):** `resolverCliente` e `resolverVendedor` aceitam: `chave` exata/aparada, `codigoErp` 🟢
- **RN-INTE-05 (3.5 Filhos — `sincronizarFilhos` / `criarFilhos` / `consolidarFilhos`):** Itens, baixas e faixas casam por `chave` **dentro do cabeçalho** (`@@unique([cabecalhoId, chave])`). 🟢
- **RN-INTE-06 (3.6 Carga por arquivo):** **Recebimento** (`POST /integracao/cargas`, ERP; ou `POST /integracao-cargas`, tela com JWT + 🟢
- **RN-INTE-07 (3.7 Filas de envio ao ERP):** **Orçamentos pendentes:** `chave = null`, `status = aprovado`, sem `erroIntegracao`, ordem de 🟢
- **RN-INTE-08 (3.8 Pedidos):** `pedidos` não tem tabela: acha o orçamento pela chave do pedido (`C5_FILIAL-C5_NUM`) e grava 🟢
- **RN-INTE-09 (3.9 Comodato por CFOP):** `itemEhComodato`: item é comodato se o ERP informou **ou** o CFOP é 5908/6908 (saída) ou 🟢
- **RN-INTE-10 (3.10 Outras regras):** Duplicata (`F1_DUPL`/`F2_DUPL`): omitido não mexe; vazio = "não gerou" (`geraDuplicata=false`). 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Entidade (endpointKey)` (Coleta) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `categorias, armazens, condicoes-pagamento, fornecedores, vendedores` (PUT/POST/PATCH/DELETE) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `regras-desconto` (idem) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `produtos` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `estoque` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `tabelas-preco` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `clientes` (PUT/POST direto; **PATCH vira solicitação**) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `titulos-receber` (idem) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `notas-saida / notas-entrada` (idem) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `objetivos` (idem) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `orcamentos` (idem) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-12 | Execução de `pedidos` (POST/PUT/DELETE) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-13 | Execução de `equipamentos-comodato` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-14 | Execução de `comunicacao` (POST) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-15 | Execução de `arquivo` (`importar` (TXT/JSON)) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-16 | Execução de `cargas` (POST de arquivo gzip/NDJSON) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/integracao` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/integracao` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/integracao` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "integracao"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "integracao"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `integracao` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/integracao/integracao.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/guards/api-key.guard.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/common/*` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/cargas/*` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/import/*` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/comunicacao/*` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/pedidos/*` | Componente central | 🟢 |
| `apps/api/src/modules/integracao/<entidade>/*.controller.ts|service.ts (16 entidades)` | Componente central | 🟢 |

