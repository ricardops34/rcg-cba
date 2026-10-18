# portal-cliente — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `portal-cliente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Área externa onde o **contato de um cliente** (não um usuário da empresa) entra com e-mail e senha e
**vê e decide os orçamentos enviados a ele** (aprovar ou recusar). A identidade vem do cadastro de
contatos do cliente (`ClienteContato`, sem base separada); a empresa libera o acesso, escolhe o perfil
de permissões e liga o portal. Existem três controllers: login (público), portal (token do contato)
e administração (usuário da empresa, JWT interno).

**Estado real:** só `orcamentos` está implementado (listar, aprovar, recusar). O catálogo de
rotinas do portal prevê `cadastro`, `contatos`, `notas`, `compras`, `titulos`, `catalogo`,
`carrinho`, e a configuração tem 9 opções (desconto, estoque, carrinho...); **nenhuma delas tem
rota nem é lida pelo código**, exceto `ativo`.

## Responsabilidades

- Área externa onde o **contato de um cliente** (não um usuário da empresa) entra com e-mail e senha e
**vê e decide os orçamentos enviados a ele** (aprovar ou recusar). 🟢
- A identidade vem do cadastro de
contatos do cliente (`ClienteContato`, sem base separada); a empresa libera o acesso, escolhe o perfil
de permissões e liga o portal. 🟢
- Existem três controllers: login (público), portal (token do contato)
e administração (usuário da empresa, JWT interno). 🟢
- **Estado real:** só `orcamentos` está implementado (listar, aprovar, recusar). 🟢
- O catálogo de
rotinas do portal prevê `cadastro`, `contatos`, `notas`, `compras`, `titulos`, `catalogo`,
`carrinho`, e a configuração tem 9 opções (desconto, estoque, carrinho...); **nenhuma delas tem
rota nem é lida pelo código**, exceto `ativo`. 🟢

## Regras de Negócio

- **RN-PC-01 (3.1 Login):** 1. `empresaAlias` e `email` em minúsculas; busca a credencial por `(empresaAlias, emailNormalizado)` 🟢
- **RN-PC-02 (3.2 `emitir` e `contexto`):** `contexto` (em `withTenant`) exige: contato `ativo`, cliente `ativo`, `portalHabilitacao.ativo` do 🟢
- **RN-PC-03 (3.3 Refresh):** Acha a sessão pelo hash; recusa se não existe, está revogada, vencida ou se a credencial está 🟢
- **RN-PC-04 (3.4 Guard e estratégia):** `PortalClienteStrategy` valida só a assinatura e a validade (`audience` fixo); **não consulta o banco**: 🟢
- **RN-PC-05 (3.5 Orçamentos do portal):** **Listar:** `withTenant`, filtra por empresa **e** `clienteId` do token. Devolve itens, 🟢
- **RN-PC-06 (3.6 Administração: criar acesso):** Em uma transação: exige `empresa.alias` e empresa acessível (`whereEmpresaAcessivel`); cliente 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Guard) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `POST /portal-cliente/auth/login` (público, `@Throttle` 10/min) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /portal-cliente/auth/refresh` (público) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /portal-cliente/auth/logout` (público) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /portal-cliente/me` (`PortalClienteGuard`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /portal-cliente/orcamentos` (idem + `orcamentos.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `PATCH /portal-cliente/orcamentos/:id/aprovar {observacao?}` (idem + `orcamentos.aprovar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `PATCH /portal-cliente/orcamentos/:id/recusar {observacao?}` (idem + `orcamentos.recusar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `GET/PUT /portal-cliente-admin/config` (JWT interno, `clientes.visualizar`/`editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `POST /portal-cliente-admin/acessos` (JWT interno, `clientes.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/portal-cliente` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/portal-cliente` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/portal-cliente` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "portal-cliente"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "portal-cliente"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `portal-cliente` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/portal-cliente/portal-cliente.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-auth.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-auth.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-admin.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-admin.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente.strategy.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente.guard.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-auth.types.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/portal-cliente-user.decorator.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/dto/portal-cliente.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/portal-cliente/apps/portal-cliente (web)` | Componente central | 🟢 |

