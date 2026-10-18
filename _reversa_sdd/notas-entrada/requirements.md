# notas-entrada — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `notas-entrada`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Consulta read-only das notas fiscais de **compra**, espelho do ERP (SF1): listagem
paginada e detalhe com itens embutidos (sem rotina própria de item). `tipo` separa dois
documentos: `'N'` compra (participante = fornecedor) e `'D'` devolução de venda
(participante = cliente). Os dados entram só pela API de integração
(`integracao/notas-entrada`, módulo irmão fora deste — ver §7); este módulo não tem
create/update/delete.

## Responsabilidades

- Consulta read-only das notas fiscais de **compra**, espelho do ERP (SF1): listagem
paginada e detalhe com itens embutidos (sem rotina própria de item). 🟢
- `tipo` separa dois
documentos: `'N'` compra (participante = fornecedor) e `'D'` devolução de venda
(participante = cliente). 🟢
- Os dados entram só pela API de integração
(`integracao/notas-entrada`, módulo irmão fora deste — ver §7); este módulo não tem
create/update/delete. 🟢

## Regras de Negócio

- **RN-NE-01 (3.1 Duas portas de acesso ao detalhe (`findOne`)):** Quem tem `notas-entrada.visualizar` (ou é admin) vê qualquer nota, sem restrição — é a 🟢
- **RN-NE-02 (3.2 Sem escopo hierárquico em `findAll`):** Comentário explícito no topo do service: compra não tem carteira de vendedor — quem 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(empresaId, query)` (filtros (`ativo`, `fornecedorId`, `clienteId`, `tipo`, `ano`, `mes`, `search`) + paginação/ordenação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne(empresaId, user, id)` (id da nota) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/notas-entrada` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/notas-entrada` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `numero/dtEmissao/dtEntrada/vlrItens/vlrBruto/ativo/createdAt` (whitelist de ordenação; fora da lista cai no default) | `apps/api/src/modules/notas-entrada` | 🟢 |
| Configuração | Constante `default de ordenação` com valor `dtEmissao desc` (quando `sortBy` não é informado ou não está na whitelist) | `apps/api/src/modules/notas-entrada` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "notas-entrada"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "notas-entrada"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `notas-entrada` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/notas-entrada/notas-entrada.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-entrada/notas-entrada.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-entrada/notas-entrada.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notas-entrada/dto/nota-entrada.dto.ts` | Componente central | 🟢 |

