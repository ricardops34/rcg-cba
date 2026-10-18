# orcamentos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `orcamentos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Único módulo de **escrita completa** (CRUD) analisado até agora entre os módulos
comerciais — orçamento é proposta comercial que nasce na plataforma (diferente de
notas, que só espelham o ERP). Cabeçalho + itens, cálculo de preço/desconto/comissão a
partir da Tabela de Preço do cliente, fluxo de duas etapas para autorização de desconto
acima do limite, geração de PDF da proposta (mesmo arquivo que o WhatsApp anexa),
rastreamento de integração com o ERP (pedido de venda gerado a partir do orçamento
aprovado) e histórico completo de atividade no CRM. Compartilha três funções puras com
`IntegracaoOrcamentosService` (módulo de integração, não analisado): `calcularItensOrcamento`,
`registrarAtividadeOrcamento`/`criarAtividadeRetorno` — citado explicitamente no código
como garantia de que tela e API externa nunca divergem na regra de negócio.

## Responsabilidades

- Único módulo de **escrita completa** (CRUD) analisado até agora entre os módulos
comerciais — orçamento é proposta comercial que nasce na plataforma (diferente de
notas, que só espelham o ERP). 🟢
- Cabeçalho + itens, cálculo de preço/desconto/comissão a
partir da Tabela de Preço do cliente, fluxo de duas etapas para autorização de desconto
acima do limite, geração de PDF da proposta (mesmo arquivo que o WhatsApp anexa),
rastreamento de integração com o ERP (pedido de venda gerado a partir do orçamento
aprovado) e histórico completo de atividade no CRM. 🟢
- Compartilha três funções puras com
`IntegracaoOrcamentosService` (módulo de integração, não analisado): `calcularItensOrcamento`,
`registrarAtividadeOrcamento`/`criarAtividadeRetorno` — citado explicitamente no código
como garantia de que tela e API externa nunca divergem na regra de negócio. 🟢

## Regras de Negócio

- **RN-ORCA-01 (3.1 `calcularItensOrcamento` — preço, desconto e comissão nunca vêm do cliente):** O vendedor informa só `produtoId`/`quantidade`/`vlrUnitario` por linha; o servidor 🟢
- **RN-ORCA-02 (3.2 Vendedor do orçamento é sempre o do cadastro do cliente, nunca escolha livre):** `create`: `vendedorId` do payload só é usado quando o cliente **não tem** vendedor 🟢
- **RN-ORCA-03 (3.3 Autorização de desconto em duas etapas, e o que a derruba):** `orcamentoExigeAutorizacao` lê o que está **gravado** nos itens (`percDesconto` + 🟢
- **RN-ORCA-04 (3.4 Status é uma máquina de estado com dois becos sem saída):** `update` recusa (409) alterar orçamento `aprovado` ("efetivado", sem volta por esta rota) 🟢
- **RN-ORCA-05 (3.5 Resposta do cliente (aprovação/recusa) é evento próprio, não "alteração"):** `update` ramifica o evento de histórico conforme o novo `status`: `'aprovado'` → 🟢
- **RN-ORCA-06 (3.6 `numero` sequencial é reservado atomicamente, fora do ciclo de vida do registro):** `proximoNumeroOrcamento`: um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` 🟢
- **RN-ORCA-07 (3.7 Validade do orçamento: dias corridos, só o último dia pula fim de semana/feriado):** `ajustarValidadeOrcamento` (`validade-orcamento.ts`) carrega o calendário útil da empresa 🟢
- **RN-ORCA-08 (3.8 PDF: dados resolvidos em duas fases (transação + fora dela), DANFE-like):** `gerarPdf` resolve o básico (busca por escopo via `QuemPede`/`recorteDoSolicitante` — 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `precoProduto(empresaId, user, clienteId, produtoId)` (cliente + produto) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findAll(empresaId, user, query, opcoes?)` (filtros (status, cliente, oportunidade, vendedor, origem, busca, datas) + paginação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `findOne(empresaId, user, id, opcoes?)` (id) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update(empresaId, user, id, input)` (id + campos parciais) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `remove(empresaId, user, id)` (id) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `solicitarAutorizacaoDesconto/autorizarDesconto` (id) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `gerarPdf(empresaId, quem, id, opcoes?)` (id) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `calcularItensOrcamento (arquivo próprio, compartilhado)` (itens + cliente + vendedor) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `registrarAtividadeOrcamento/orcamentoExigeAutorizacao (arquivo próprio)` (evento + dados do orçamento) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/orcamentos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `numero/titulo/status/vlrTotal/dataValidade/ativo/createdAt` (whitelist de ordenação; fora da lista cai em `createdAt`) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `DESCONTO_ACIMA_LIMITE_BLOQUEIA (ParametrosService)` com valor `bool, default false` (liga a recusa de gravação (em vez de só aviso) quando desconto passa do máximo da regra) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `PARAMETRO_ORCAMENTO_EXIBIR_FOTOS (ParametrosService)` com valor `bool, default true` (inclui coluna de foto do produto na tabela do PDF) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `COMISSAO_OCULTA_PARA_TODOS (ParametrosService)` com valor `bool, default false` (zera as faixas da regra de desconto e oculta comissão dos itens na resposta) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `OrigemVenda (enum)` com valor `vendedor/superior/administrador/cliente/erp` (ver §3.2; histórico anterior a 02/09/2026 todo gravado como `vendedor` (não dá para recuperar quem digitou)) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `StatusOrcamento (enum)` com valor `rascunho/enviado/aprovado/recusado/expirado` (máquina de estado — ver §3.4) | `apps/api/src/modules/orcamentos` | 🟢 |
| Configuração | Constante `SituacaoErpOrcamento (enum)` com valor `pendente/liberado/bloqueado_credito/bloqueado_estoque/bloqueado_desconto/faturado_parcial/faturado/cancelado` (gravada só pela integração (fora deste módulo); `faturado_parcial` exibido como "Faturando" na tela (decisão de 29/09/2026)) | `apps/api/src/modules/orcamentos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "orcamentos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "orcamentos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `orcamentos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/orcamentos/orcamentos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/orcamentos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/orcamentos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/dto/orcamento.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/calcular-itens-orcamento.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/registrar-atividade-orcamento.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/criar-atividade-retorno.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/validade-orcamento.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/proximo-numero-orcamento.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamentos/orcamento-pdf.ts` | Componente central | 🟢 |

