# tours — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `tours`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Tour guiado por tela: na primeira visita a uma tela com tour, o navegador pergunta à API se aquela **versão** do tour já foi exibida àquele usuário naquela empresa; se não foi, abre sozinho. A API guarda só o **histórico** (quem viu qual versão, até que passo, como terminou). O **conteúdo** dos tours (passos, textos, seletores de tela) vive no código do front, não no banco, e é compartilhado com a ajuda contextual (`AJUDAS_MODULOS`).

## Responsabilidades

- Tour guiado por tela: na primeira visita a uma tela com tour, o navegador pergunta à API se aquela **versão** do tour já foi exibida àquele usuário naquela empresa; se não foi, abre sozinho. 🟢
- A API guarda só o **histórico** (quem viu qual versão, até que passo, como terminou). 🟢
- O **conteúdo** dos tours (passos, textos, seletores de tela) vive no código do front, não no banco, e é compartilhado com a ajuda contextual (`AJUDAS_MODULOS`). 🟢

## Regras de Negócio

- **RN-TOUR-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-TOUR-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /tours/:codigo/estado?versao=` (`deveIniciarAutomaticamente = (nenhuma execução desta versão)`; devolve a última execução) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /tours/:codigo/execucoes {versao, origem}` (`automatico`: devolve a execução existente da versão, se houver; senão cria. `manual` (replay): **sempre cria** outra) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `PATCH /tours/execucoes/:id {passoAtual, status}` (atualiza só linha do próprio usuário e empresa ativa (`updateMany`); 404 se não for; `finalizadoEm` nulo em `em_andamento`, agora nos demais) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/tours` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/tours` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/tours` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "tours"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "tours"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `tours` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/tours/tours.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/tours/tours.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/tours/tours.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/tours/dto/tour.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/tours/web: components/tour/*` | Componente central | 🟢 |
| `apps/api/src/modules/tours/web: lib/tours/*` | Componente central | 🟢 |

