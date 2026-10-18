# politica-senha — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `politica-senha`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

A **política de senha por empresa**, guardada como parâmetros (`SENHA_*` em
Administração > Parâmetros desde 2026-08-26; antes era uma tabela global com tela
própria). O serviço resolve a política vigente, **valida** senhas (fonte de verdade da
força da senha; o Zod só garante o formato básico), valida **reuso** contra o histórico,
grava o histórico e **gera senha provisória**. Consumidores: `auth` (login, bloqueio,
expiração, troca), `usuarios` (criação e reset), `vendedores` (usuário provisório) e
`recuperacao-senha`.

## Responsabilidades

- A **política de senha por empresa**, guardada como parâmetros (`SENHA_*` em
Administração > Parâmetros desde 2026-08-26; antes era uma tabela global com tela
própria). 🟢
- O serviço resolve a política vigente, **valida** senhas (fonte de verdade da
força da senha; o Zod só garante o formato básico), valida **reuso** contra o histórico,
grava o histórico e **gera senha provisória**. 🟢
- Consumidores: `auth` (login, bloqueio,
expiração, troca), `usuarios` (criação e reset), `vendedores` (usuário provisório) e
`recuperacao-senha`. 🟢

## Regras de Negócio

- **RN-PS-01 (3.1 Política da empresa):** Dez parâmetros lidos com `obterNumero`/`obterBoolean` (padrão quando ausentes): 🟢
- **RN-PS-02 (3.2 Política da conta — a mais restritiva):** A senha é da **conta**, não da empresa: vale a **mais restritiva entre as empresas com 🟢
- **RN-PS-03 (3.3 Validação, reuso e histórico):** `validarSenhaContra` junta todas as violações numa mensagem só (400). 🟢
- **RN-PS-04 (3.4 Senha provisória):** `max(mínimo da política, 14)` caracteres, limitado ao máximo; sempre as quatro 🟢
- **RN-PS-05 (3.5 Achados):** ✅ **Corrigido em 5eba615** (2026-10-15; confirmado na base de dev: 0 vínculos lidos sem contexto contra 16 ativos — agora lê com `withUsuario`). Achado original: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Guarda) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /politica-senha` (JWT, `@PermitirTermoPendente`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /politica-senha/empresa-ativa` (JWT) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `GET /politica-senha/usuario/:id` (`usuarios.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/politica-senha` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/politica-senha` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/politica-senha` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "politica-senha"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "politica-senha"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `politica-senha` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/politica-senha/politica-senha.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/politica-senha/politica-senha.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/politica-senha/politica-senha.service.ts` | Componente central | 🟢 |

