# vendedores — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `vendedores`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Cadastro dos vendedores da empresa — a peça que define **carteira** (cliente →
vendedor) e **hierarquia** (`superiorId`), base do escopo de visibilidade de quase todo o
sistema (`common/escopo/escopo-vendedores.ts`). Além do CRUD, cria o **usuário de acesso**
do vendedor (perfil "Vendedor" do grupo ou da plataforma, senha provisória por e-mail e/ou
SMS), reenvia senha, bloqueia/desbloqueia vendedor e usuário juntos, e responde "qual
vendedor **este usuário é**" (`vendedorDoUsuario`, usado pelo agente de IA). O ERP também
grava vendedores pela integração (comissão `percComissao` é só do ERP).

## Responsabilidades

- Cadastro dos vendedores da empresa — a peça que define **carteira** (cliente →
vendedor) e **hierarquia** (`superiorId`), base do escopo de visibilidade de quase todo o
sistema (`common/escopo/escopo-vendedores.ts`). 🟢
- Além do CRUD, cria o **usuário de acesso**
do vendedor (perfil "Vendedor" do grupo ou da plataforma, senha provisória por e-mail e/ou
SMS), reenvia senha, bloqueia/desbloqueia vendedor e usuário juntos, e responde "qual
vendedor **este usuário é**" (`vendedorDoUsuario`, usado pelo agente de IA). 🟢
- O ERP também
grava vendedores pela integração (comissão `percComissao` é só do ERP). 🟢

## Regras de Negócio

- **RN-VEND-01 (3.1 `desligado` como controle de saída, `ativo` como espelho):** `espelharDesligado`: quando a gravação traz `desligado`, `ativo = !desligado` — os selects 🟢
- **RN-VEND-02 (3.2 Hierarquia sem ciclo):** `garantirHierarquiaSemCiclo` (só no `update`): recusa ser superior de si mesmo e sobe a 🟢
- **RN-VEND-03 (3.3 Criação do usuário de acesso):** Na transação (timeout 15 s): vendedor sem usuário e com e-mail; e-mail livre na **base 🟢
- **RN-VEND-04 (3.4 Carteira na listagem):** `groupBy(vendedorId, ativo)` nos clientes da página. Comentário PENDENTE: cliente PJ com 🟢
- **RN-VEND-05 (3.5 Achados):** 🟡 **`bloquear` derruba o usuário na plataforma inteira.** `usuario.ativo=false` vale para 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll — GET /vendedores` (`vendedores.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne — GET /:id` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create — POST` (`cadastrar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update — PATCH /:id` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `remove — DELETE /:id` (`excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `criarUsuario — POST /:id/criar-usuario` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `reenviarSenha — POST /:id/reenviar-senha` (`editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `bloquear / desbloquear — PATCH /:id/(des)bloquear` (`vendedores.bloquear`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/vendedores` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `nome, codigoErp, email, ativo, createdAt` (ordem padrão `nome`) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `SALT_ROUNDS` com valor `12` (bcrypt da senha provisória) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `timeout das transações de usuário` com valor `15 s` (`criarUsuario`, `reenviarSenha`) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `Teto da subida de hierarquia` com valor `50 degraus` (`garantirHierarquiaSemCiclo`) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `Perfil padrão` com valor `nome "Vendedor" (grupo, senão plataforma)` (`criarUsuario`) | `apps/api/src/modules/vendedores` | 🟢 |
| Configuração | Constante `E-mail / SMS de senha` com valor `disponibilidade().senhaProvisoria` (Administração > E-mail / SMS) | `apps/api/src/modules/vendedores` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "vendedores"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "vendedores"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `vendedores` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/vendedores/vendedores.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/vendedores/vendedores.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/vendedores/vendedores.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/vendedores/dto/vendedor.dto.ts` | Componente central | 🟢 |

