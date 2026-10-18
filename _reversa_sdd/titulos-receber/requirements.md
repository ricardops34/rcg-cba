# titulos-receber — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `titulos-receber`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Consulta somente-leitura das contas a receber que o ERP integra (`TituloReceber` +
`TituloReceberBaixa`), no escopo hierárquico do usuário, e **2ª via de boleto em PDF**
(Bradesco/237) — reimpressão de cobrança já registrada pelo ERP, nunca registro novo.
Atualiza o valor do título vencido com multa e juros do próprio ERP e encerra a emissão
depois de um prazo de atraso configurável. É o serviço por trás de outros consumidores
além da tela: Posição de Cliente (`clientes.service`), agente de IA
(`agente-tools.service`), envio por e-mail (`documentos-email`), aviso de vencimento por
SMS (`sms-aviso-vencimento`) e a conversa de WhatsApp (que chama `gerarBoleto` com
`registrarEvento: false`).

## Responsabilidades

- Consulta somente-leitura das contas a receber que o ERP integra (`TituloReceber` +
`TituloReceberBaixa`), no escopo hierárquico do usuário, e **2ª via de boleto em PDF**
(Bradesco/237) — reimpressão de cobrança já registrada pelo ERP, nunca registro novo. 🟢
- Atualiza o valor do título vencido com multa e juros do próprio ERP e encerra a emissão
depois de um prazo de atraso configurável. 🟢
- É o serviço por trás de outros consumidores
além da tela: Posição de Cliente (`clientes.service`), agente de IA
(`agente-tools.service`), envio por e-mail (`documentos-email`), aviso de vencimento por
SMS (`sms-aviso-vencimento`) e a conversa de WhatsApp (que chama `gerarBoleto` com
`registrarEvento: false`). 🟢

## Regras de Negócio

- **RN-TR-01 (3.1 Status e "vencimento efetivo" com feriados):** `calcularStatusTituloReceber`: `dtBaixa` → `baixado`; vencimento **anterior** a hoje → 🟢
- **RN-TR-02 (3.2 Valor atualizado do título vencido (`calcularEncargos`)):** Regra fechada com o usuário em 2026-08-21, ajustada em 2026-10-09: 🟢
- **RN-TR-03 (3.3 `gerarBoleto` — ordem das guardas e precedência dos dados):** 1. Recorte por quem pede (`recorteDoSolicitante`): usuário → escopo de vendedores; 🟢
- **RN-TR-04 (3.4 Código de barras FEBRABAN + campo livre Bradesco):** Fator de vencimento: dias desde 07/10/1997; abaixo de 1000 é inválido; **depois de 9999 🟢
- **RN-TR-05 (3.5 Instruções ao caixa sem duplicar encargo):** `montarInstrucoes` gera "Importancia por Dia de Atraso…" e "Após Vencimento Cobrar 🟢
- **RN-TR-06 (3.6 Achados — onde o comentário e o código divergem):** 🔴 **Título baixado.** O `ApiOperation` da rota diz "Recusa com 409 quando … o título já 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(empresaId, user, query, {ignorarEscopo?}) — GET /titulos-receber (titulos-receber.visualizar)` (filtros (status, cliente, vendedor, ativo, busca), paginação, ordem) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne(…, id, {ignorarEscopo?}) — GET /titulos-receber/:id (+ posicao-cliente.visualizar)` (id) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `gerarBoleto(empresaId, quem, id, {registrarEvento?, atualizado?}) — GET /:id/boleto?atualizado=` (`QuemPede` (usuário ou cliente do WhatsApp), id) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `descreverBoleto(vencimento, encargos)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `calcularStatusTituloReceber(titulo, hoje) (titulo-receber-status.ts)` (`dtBaixa`, `vencimento`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `calcularEncargos, diasEmAtraso, foraDoPrazoDeReemissao, podeEmitirBoleto (boleto-atualizacao.ts)` (saldo, vencimento, multa/juros do ERP) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `montarBoleto, fatorVencimento, campoLivreBradesco, DVs (boleto-codigo.ts)` (dados de cobrança) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `montarBoletoPdf (boleto-pdf.ts)` (dados já resolvidos) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `montarInstrucoes(titulo, conta, usarAtualizado) (exportada)` (instruções do título e da conta) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `BOLETO_PRAZO_MAXIMO_REEMISSAO (parâmetro)` com valor `padrão **60** dias` (`parametros.service`; lido em `findAll`, `findOne` e `gerarBoleto`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `PRAZO_MAXIMO_REEMISSAO_DIAS` com valor `60` (`boleto-atualizacao.ts` (padrão das funções puras)) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `BANCOS_SUPORTADOS` com valor `['237']` (`boleto-codigo.ts`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `numero, emissao, vencimento, valor, saldo, dtBaixa, createdAt` (service; padrão `vencimento desc`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `Data-base FEBRABAN` com valor `07/10/1997; reinício do fator em 22/02/2025` (`fatorVencimento`) | `apps/api/src/modules/titulos-receber` | 🟢 |
| Configuração | Constante `Busca (search)` com valor `numero ou cliente.razaoSocial (sem fantasia, código ou CNPJ)` (`findAll`) | `apps/api/src/modules/titulos-receber` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "titulos-receber"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "titulos-receber"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `titulos-receber` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/titulos-receber/titulos-receber.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/titulos-receber.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/titulos-receber.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/titulo-receber-status.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/boleto-atualizacao.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/boleto-codigo.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/boleto-pdf.ts` | Componente central | 🟢 |
| `apps/api/src/modules/titulos-receber/dto/titulo-receber.dto.ts` | Componente central | 🟢 |

