# produtos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `produtos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

CRUD do catálogo de produtos (origem ERP ou nascido na plataforma), com trava de edição
nos campos que o import do Protheus sobrescreveria; preços por tabela; fotos (upload
manual e importação em lote por nome de arquivo); fichas técnicas em PDF com extração de
Markdown por IA (manual ou importação em lote por conteúdo), indexação semântica dessas
fichas; produtos relacionados (similares e aplicação, usado também por Equipamentos de
Comodato); e o recorte do que a IA pode falar sobre um produto — nunca preço.

## Responsabilidades

- CRUD do catálogo de produtos (origem ERP ou nascido na plataforma), com trava de edição
nos campos que o import do Protheus sobrescreveria; preços por tabela; fotos (upload
manual e importação em lote por nome de arquivo); fichas técnicas em PDF com extração de
Markdown por IA (manual ou importação em lote por conteúdo), indexação semântica dessas
fichas; produtos relacionados (similares e aplicação, usado também por Equipamentos de
Comodato); e o recorte do que a IA pode falar sobre um produto — nunca preço. 🟢

## Regras de Negócio

- **RN-PROD-01 (3.1 Trava de campos do ERP (`CAMPOS_DO_ERP`)):** `update` só compara e bloqueia os campos de `CAMPOS_DO_ERP` quando o produto tem `chave` 🟢
- **RN-PROD-02 (3.2 Preço por tabela com herança de regra de desconto (`precos`)):** Monta, por item de tabela de preço ativa, a regra de desconto que vale naquela linha, na 🟢
- **RN-PROD-03 (3.3 Fichas técnicas — extração por IA e corte de preço (`FichaImportacaoService`,):** `ProdutoFichasService`, `sem-preco.ts`) 🟢 🟢
- **RN-PROD-04 (3.4 `partir-ficha.ts` — particionamento de Markdown para embedding):** Alvo de ~800 caracteres por trecho (equilíbrio entre contexto suficiente e diluição do 🟢
- **RN-PROD-05 (3.5 Busca híbrida para a IA (`ProdutoParaAgenteService.procurarHibrido`/`procurar`)):** **Lexical "candidatos primeiro, pontuação depois"**: cada termo da busca gera um braço de 🟢
- **RN-PROD-06 (3.6 Similares e aplicação — leitura dos dois lados, regra de categoria (`ProdutoRelacionadosService`)):** `listar`/`listarTx` junta as relações que partem do produto e as que chegam, marcando 🟢
- **RN-PROD-07 (3.7 Importação de fotos por nome de arquivo (`codigosDoNome`)):** Extrai candidatos do nome do arquivo (sem extensão) e uma variante sem sufixo 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `ProdutosService` (CRUD, listagem com filtros/busca, preços por tabela (`precos`), opções de filtro, fotos (upload, principal, remoção)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `ProdutoRelacionadosService` (CRUD de similares/aplicação, lidos dos dois lados; recusa produto de categoria "equipamento de comodato" como aplicável) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `ProdutoFichasService` (CRUD de ficha técnica (PDF + Markdown), delega reindexação ao `FichaEmbeddingService`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `FichaImportacaoService` (Fila de importação de fichas por PDF: upload grava e devolve, varredura (`setInterval`) lê cada PDF via provedor de IA e vincula ao produto pelo conteúdo) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `FichaEmbeddingService` (Parte a ficha em trechos (`partirFicha`), indexa (apaga e refaz) e vetoriza os pendentes em lote) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `ProdutoFotosImportacaoService` (Importação de fotos em lote, vínculo por código extraído do nome do arquivo) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `ProdutoParaAgenteService` (Busca híbrida (lexical + semântica) e dossiê de produto para a IA — nunca lê `ultimoPreco`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/produtos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `CAMPOS_DO_ERP` com valor `14 campos` (trava de edição em produto com `chave`) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `5 campos` (whitelist de ordenação da listagem) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `ALVO / MINIMO / MAXIMO_TRECHOS (partir-ficha.ts)` com valor `800 / 120 / 60` (tamanho-alvo do trecho, limiar de "grudar", teto por ficha) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `INDICIOS (sem-preco.ts)` com valor `10 regex` (o que denuncia preço numa linha de ficha) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `FichaImportacaoService.INTERVALO_MS / POR_RODADA / MAX_TENTATIVAS` com valor `5000ms / 1 / 3` (cadência e paralelismo da varredura de PDFs) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `FichaEmbeddingService.LOTE` com valor `32` (trechos por chamada ao provedor de embeddings) | `apps/api/src/modules/produtos` | 🟢 |
| Configuração | Constante `VAZIAS (produto-para-agente.service.ts)` com valor `~60 palavras` (stop-words da busca da IA) | `apps/api/src/modules/produtos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "produtos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "produtos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `produtos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/produtos/produtos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produtos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produtos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produto-relacionados.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produto-fichas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/ficha-importacao.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/ficha-importacao.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/ficha-embedding.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/partir-ficha.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/sem-preco.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produto-fotos-importacao.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produto-fotos-importacao.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/produto-para-agente.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produtos/dto/produto.dto.ts` | Componente central | 🟢 |

