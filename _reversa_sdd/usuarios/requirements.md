# usuarios — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `usuarios`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

CRUD da conta `Usuario` dentro do escopo da empresa ativa, gestão de vínculo
usuário×empresa (`UsuarioEmpresa`) com atribuição de perfil/superior/dados pessoais,
reset de senha por administrador e cadastro de horário de trabalho (restrição de
expediente). Não cobre login/token/próprio perfil — isso é `auth` (ver módulo `auth`).

## Responsabilidades

- CRUD da conta `Usuario` dentro do escopo da empresa ativa, gestão de vínculo
usuário×empresa (`UsuarioEmpresa`) com atribuição de perfil/superior/dados pessoais,
reset de senha por administrador e cadastro de horário de trabalho (restrição de
expediente). 🟢
- Não cobre login/token/próprio perfil — isso é `auth` (ver módulo `auth`). 🟢

## Regras de Negócio

- **RN-USUA-01 (3.1 Trava de escalonamento de perfil (`garantirPodeAtribuirPerfil`)):** Impede conceder **ou retirar** um perfil com `administraPlataforma: true` por quem não é 🟢
- **RN-USUA-02 (3.2 Conta única por grupo econômico (`vincularEmpresa`, `create`)):** Decisão de 30/09/2026: uma conta pertence a um grupo econômico só. `vincularEmpresa` 🟢
- **RN-USUA-03 (3.3 Herança de dados de `Vendedor` pré-existente (`create`)):** Ao criar um usuário, busca `Vendedor`s sem `usuarioId` com o mesmo e-mail na empresa e: 🟢
- **RN-USUA-04 (3.4 Resolução de vínculos no alcance do grupo (`findOne`)):** `usuario_empresas` tem RLS por tenant — um `include` direto sem `withTenant` definido 🟢
- **RN-USUA-05 (3.5 Unificação de dados divergentes (`dadosDoVendedor`, em `common/usuarios/`)):** Quando há mais de um `Vendedor` candidato com valores diferentes para o mesmo campo 🟢
- **RN-USUA-06 (3.6 WhatsApp replicado para `Vendedor` do grupo (`gravarWhatsappDoUsuario`)):** Ao gravar celular/telefone do usuário (via `vincularEmpresa`), propaga o número 🟢
- **RN-USUA-07 (3.7 Substituição em bloco do horário de trabalho (`salvarHorarios`)):** Em vez de diff linha a linha, apaga todas as faixas do usuário e recria a partir do 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(empresaId, query)` (filtros (perfilId, ativo, search), paginação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne(id, empresaAtivaId?)` (id, empresa ativa opcional) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create(input, empresaId, actorId, atorEhAdminPlataforma)` (dados + senha) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update(id, input, actorId)` (campos simples) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `resetSenha(id, input, actorId)` (nova senha) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `remove(id, actorId)` (id) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `vincularEmpresa(usuarioId, empresaId, input, actorId, atorEhAdminPlataforma)` (perfilId, superiorId, dados pessoais) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `obterHorarios / salvarHorarios(id, input, actorId)` (faixas por dia da semana) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `desvincularEmpresa(usuarioId, empresaId, actorId, empresaAtivaId)` (ids) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `empresasNoAlcance(empresaAtivaId) (privado)` (empresa ativa) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `garantirPodeAtribuirPerfil(...) (privado)` (perfil novo/atual, flag admin plataforma, empresaId) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/usuarios` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/usuarios` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/usuarios` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "usuarios"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "usuarios"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `usuarios` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/usuarios/usuarios.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/usuarios/usuarios.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/usuarios/usuarios.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/usuarios/dto/usuario.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/usuarios/common/usuarios/whatsapp-do-usuario.ts` | Componente central | 🟢 |
| `apps/api/src/modules/usuarios/common/usuarios/dados-do-vendedor.ts` | Componente central | 🟢 |

