# notas-saida — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `notas-saida`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Consulta read-only das notas fiscais de **venda**, espelho do ERP (SF2): listagem
paginada, detalhe com itens e, exclusivo deste módulo, a **2ª via de DANFE** (PDF) e o
**XML autorizado** da NF-e para download — ambos renderizados/lidos sob demanda a partir
do XML que o ERP empurrou pela integração (não deste módulo). `tipo` separa dois
documentos: venda normal e `'D'` devolução de compra (participante = fornecedor, não
cliente). Dados entram só pela API de integração (módulo irmão, fora deste); sem
create/update/delete aqui. Compartilha com `notas-entrada` a estrutura geral, mas tem
responsabilidade extra (parsing de XML + geração de PDF) que o módulo de compra não tem.

## Responsabilidades

- Consulta read-only das notas fiscais de **venda**, espelho do ERP (SF2): listagem
paginada, detalhe com itens e, exclusivo deste módulo, a **2ª via de DANFE** (PDF) e o
**XML autorizado** da NF-e para download — ambos renderizados/lidos sob demanda a partir
do XML que o ERP empurrou pela integração (não deste módulo). 🟢
- `tipo` separa dois
documentos: venda normal e `'D'` devolução de compra (participante = fornecedor, não
cliente). 🟢
- Dados entram só pela API de integração (módulo irmão, fora deste); sem
create/update/delete aqui. 🟢
- Compartilha com `notas-entrada` a estrutura geral, mas tem
responsabilidade extra (parsing de XML + geração de PDF) que o módulo de compra não tem. 🟢

## Regras de Negócio

- **RN-NS-01 (3.1 Escopo por carteira usa o vendedor do **cliente**, não o da nota):** Comentário explícito no topo do service: `notaSaida.vendedorId` é quem efetivamente fez a 🟢
- **RN-NS-02 (3.2 Devolução de compra (`tipo = 'D'`) não tem dono de carteira):** `query.devolucao === true`: filtro vira `{ tipo: 'D' }` e **ignora** o filtro de 🟢
- **RN-NS-03 (3.3 `lerXml` — leitura em duas etapas, sem o XML na consulta de escopo):** O `select` da consulta de nota **não inclui** `xml.conteudo`: o conteúdo mora em 🟢
- **RN-NS-04 (3.4 `gerarDanfe` — XML → dados → PDF → evento condicional):** Ver `flowcharts/notas-saida-gerarDanfe.md` para o fluxo completo. Pontos centrais: 🟢
- **RN-NS-05 (3.5 Parser de XML próprio, com defesas explícitas contra XXE (`nfe-xml.ts`)):** `lerXml` (em `nfe-xml.ts`, não confundir com o método privado do service de mesmo nome) 🟢
- **RN-NS-06 (3.6 `montarDanfePdf` — paginação de itens e carimbos (`danfe-pdf.ts`)):** Reproduz o layout do DANFE retrato que o Protheus imprime (pedido do usuário, 01/10/2026, 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(empresaId, user, query, opcoes?)` (filtros (`ativo`, `clienteId`, `vendedorId`, `comodato`, `tipo`, `devolucao`, `ano`, `mes`, `search`) + paginação/ordenação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne(empresaId, user, id, opcoes?)` (id da nota) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `obterXml(empresaId, user, id, opcoes?)` (id da nota) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `lerXml(empresaId, quem, id) *(privado)*` (id da nota) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `registrarEvento(...) *(privado)*` (nota, autor, evento, detalhes) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/notas-saida` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `numero/dtEmissao/vlrItens/vlrBruto/ativo/createdAt` (whitelist de ordenação; fora da lista cai no default) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `default de ordenação` com valor `dtEmissao desc` (quando `sortBy` não é informado ou não está na whitelist) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `TIPO_DEVOLUCAO` com valor `'D'` (marca devolução de compra (destinatário = fornecedor)) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `NFE_XML_MAX_BYTES (nfe-xml.ts)` com valor `5 MiB` (teto do XML aceito na ingestão) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `PROFUNDIDADE_MAXIMA (nfe-xml.ts)` com valor `60` (teto de aninhamento do parser próprio) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `MODALIDADE_FRETE (danfe-pdf.ts)` com valor `mapa 0–4,9 → rótulo` (tradução do `modFrete` do XML para o texto impresso no DANFE) | `apps/api/src/modules/notas-saida` | 🟢 |
| Configuração | Constante `cStat de cancelamento (nfe-xml.ts)` com valor `101/135/151/155` (marca `cancelada: true` em `extrairNfe`) | `apps/api/src/modules/notas-saida` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "notas-saida"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "notas-saida"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `notas-saida` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/notas-saida/notas-saida.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/notas-saida.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/notas-saida.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/dto/nota-saida.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/nota-flags.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/nfe-xml.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-saida/danfe-pdf.ts` | Componente central | 🟢 |

