# oportunidades — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `oportunidades`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Funil de vendas do CRM: CRUD de oportunidades (cliente + vendedor + título + estágio +
valor/previsão), com soft delete. É o "guarda-chuva" a que `atividades` e `orcamentos`
podem se ligar (`oportunidadeId`). O service é exportado e reusado pelo agente interno
(`listar_oportunidades`, `registrar_oportunidade`, `mover_oportunidade` e o histórico
do cliente).

## Responsabilidades

- Funil de vendas do CRM: CRUD de oportunidades (cliente + vendedor + título + estágio +
valor/previsão), com soft delete. 🟢
- É o "guarda-chuva" a que `atividades` e `orcamentos`
podem se ligar (`oportunidadeId`). 🟢
- O service é exportado e reusado pelo agente interno
(`listar_oportunidades`, `registrar_oportunidade`, `mover_oportunidade` e o histórico
do cliente). 🟢

## Regras de Negócio

- **RN-OPOR-01 (3.1 Recorte por escopo hierárquico):** Todas as rotas resolvem `resolverEscopoVendedores` (`null` = sem restrição; senão a 🟢
- **RN-OPOR-02 (3.2 Cliente precisa ser da carteira do escopo):** `garantirClienteNoEscopo`: cliente existe na empresa, não excluído, e — com escopo 🟢
- **RN-OPOR-03 (3.3 Data de fechamento automática):** Ao gravar com `estagio` `ganha` ou `perdida` e sem `dataFechamento` no payload, o 🟢
- **RN-OPOR-04 (3.4 Uso pelo agente interno):** `registrar_oportunidade`: força `vendedorId` = vendedor do usuário logado 🟢
- **RN-OPOR-05 (3.5 Achados):** 🔴 **"Motivo obrigatório ao marcar como perdida" vive só no prompt e na tela.** O 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll — GET /oportunidades` (`oportunidades.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne — GET /oportunidades/:id` (`oportunidades.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create — POST /oportunidades` (`oportunidades.cadastrar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update — PATCH /oportunidades/:id` (`oportunidades.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `remove — DELETE /oportunidades/:id` (`oportunidades.excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `limpar (privada)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `normalizarFechamento (privada)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `garantirVendedorNoEscopo / garantirClienteNoEscopo (privadas)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/oportunidades` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/oportunidades` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/oportunidades` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "oportunidades"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "oportunidades"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `oportunidades` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/oportunidades/oportunidades.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/oportunidades/oportunidades.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/oportunidades/oportunidades.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/oportunidades/dto/oportunidade.dto.ts` | Componente central | 🟢 |

