# acessos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `acessos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Duas frentes dentro do mesmo módulo: (a) auditoria de acesso só-leitura — eventos de
login/logout/falha (`AcessoLog`), sessões com tempo de uso (`Sessao`) e uso por rotina
(`UsoRotina`), consumidas pela tela Administração > Acessos; (b) a restrição de
expediente (`HorarioTrabalhoService`) que o `JwtAuthGuard` consulta a cada requisição
para decidir se o usuário pode acessar agora. Quem grava os eventos de auditoria é o
fluxo de autenticação (`auth`), nunca esta API — `AcessosController` é só leitura.

## Responsabilidades

- Duas frentes dentro do mesmo módulo: (a) auditoria de acesso só-leitura — eventos de
login/logout/falha (`AcessoLog`), sessões com tempo de uso (`Sessao`) e uso por rotina
(`UsoRotina`), consumidas pela tela Administração > Acessos; (b) a restrição de
expediente (`HorarioTrabalhoService`) que o `JwtAuthGuard` consulta a cada requisição
para decidir se o usuário pode acessar agora. 🟢
- Quem grava os eventos de auditoria é o
fluxo de autenticação (`auth`), nunca esta API — `AcessosController` é só leitura. 🟢

## Regras de Negócio

- **RN-ACES-01 (3.1 Resolução de rota → rotina (`rotinasPorRota`, `registrarUso`)):** O catálogo rota→rotina é lido do `Menu` (`rota`) e cacheado em memória por 5 minutos 🟢
- **RN-ACES-02 (3.2 Isolamento sem RLS via filtro em código (`usuariosDaEmpresa`, `whereEventos`, `whereSessoes`)):** `AcessoLog` e `Sessao` não têm RLS por tenant — são escritos no login, antes de existir 🟢
- **RN-ACES-03 (3.3 Sessão "viva" sem fechamento explícito (`sessaoAtiva`, `MINUTOS_SESSAO_VIVA`)):** Uma sessão sem `encerradaEm` só conta como ativa se `ultimaAtividadeEm` estiver a menos 🟢
- **RN-ACES-04 (3.4 Agregação dupla sessões+eventos em memória (`resumo`)):** Constrói um mapa por `usuarioId` em duas passadas: primeiro todas as sessões do período 🟢
- **RN-ACES-05 (3.5 Cache de 1 minuto + feriado do dia (`HorarioTrabalhoService.verificar`)):** Roda em toda requisição autenticada (via guard), então o TTL de 1 min equilibra custo 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `registrar(dados)` (evento, email, ids opcionais) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `abrirSessao / tocarSessao / encerrarSessao` (ids, empresa) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `situacaoSessao(sessaoId)` (id) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `encerrarSessoes(filtro, motivo)` (usuarioId + `manter`/`sessaoId`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `registrarUso(empresaId, usuarioId, caminho)` (caminho da tela (web)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `usoPorRotina(empresaId, query)` (filtros + período) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `desconectar(empresaId, ator, sessaoId)` (id da sessão) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `encerrarSessoesDoUsuario(usuarioId, motivo)` (id, motivo) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `listarEventos / listarSessoes` (filtros + paginação) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `resumo(empresaId, user, query)` (filtros + período) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `HorarioTrabalhoService.verificar(usuarioId, empresaId?, agora?)` (ids, instante) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/acessos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/acessos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/acessos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "acessos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "acessos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `acessos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/acessos/acessos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/acessos/acessos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/acessos/uso-rotina.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/acessos/acessos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/acessos/horario-trabalho.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/acessos/dto/acesso.dto.ts` | Componente central | 🟢 |

