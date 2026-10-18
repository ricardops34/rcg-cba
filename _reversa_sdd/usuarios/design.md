# usuarios — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `usuarios`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(empresaId, query)` | `filtros (perfilId, ativo, search), paginação` | `lista paginada + `vinculoId`` | Média — roda dentro de `withTenant` por causa de RLS em `usuarioEmpresas`/`perfil` |
| `findOne(id, empresaAtivaId?)` | `id, empresa ativa opcional` | `usuário sem `senhaHash` + `usuarioEmpresas` resolvidos por empresa` | Alta — lê vínculo empresa a empresa no alcance do grupo, sem empresa cai em `withUsuario` |
| `create(input, empresaId, actorId, atorEhAdminPlataforma)` | `dados + senha` | `usuário criado` | Alta — checagem de perfil restrito, unicidade de e-mail por `withSistema`, vaga de licença, hash bcrypt, herda dados de `Vendedor` pré-existente e o vincula |
| `update(id, input, actorId)` | `campos simples` | `usuário atualizado` | Baixa — não altera senha nem vínculos |
| `resetSenha(id, input, actorId)` | `nova senha` | ``{success}`` | Média — valida política + reuso, grava histórico, zera lockout |
| `remove(id, actorId)` | `id` | ``{success}`` | Baixa — soft delete + `ativo: false` |
| `vincularEmpresa(usuarioId, empresaId, input, actorId, atorEhAdminPlataforma)` | `perfilId, superiorId, dados pessoais` | `vínculo criado/reativado (upsert)` | Alta — valida grupo econômico único, perfil restrito, superior no mesmo grupo, vaga de licença, grava WhatsApp |
| `obterHorarios / salvarHorarios(id, input, actorId)` | `faixas por dia da semana` | `horários + flag `restringirHorario`` | Média — substitui em bloco (delete+create) dentro de transação, invalida cache do guard |
| `desvincularEmpresa(usuarioId, empresaId, actorId, empresaAtivaId)` | `ids` | ``{success}`` | Média — `empresaId` só é aceita se estiver no alcance (grupo) de `empresaAtivaId` |
| `empresasNoAlcance(empresaAtivaId) (privado)` | `empresa ativa` | `lista de ids (ela + grupo)` | Baixa |
| `garantirPodeAtribuirPerfil(...) (privado)` | `perfil novo/atual, flag admin plataforma, empresaId` | `lança `ForbiddenException` ou retorna` | Média — ver 3.1 |

## Fluxo Principal

### 1. 3.1 Trava de escalonamento de perfil (`garantirPodeAtribuirPerfil`)

Impede conceder **ou retirar** um perfil com `administraPlataforma: true` por quem não é
ele mesmo administrador da plataforma — fecha uma rota de escalonamento que
`usuarios.editar` (permissão que Administrador Empresa tem) deixaria aberta ao atribuir
um `perfilId` existente a um vínculo, já que a tela de Perfis tem `PlatformAdminGuard`
mas esta rota não. Antes dessa checagem, para qualquer ator: o perfil precisa ser da
plataforma ou do grupo econômico da empresa (`garantirPerfilDoGrupo`).

### 2. 3.2 Conta única por grupo econômico (`vincularEmpresa`, `create`)

Decisão de 30/09/2026: uma conta pertence a um grupo econômico só. `vincularEmpresa`
recusa (`ConflictException`) vincular a uma empresa de grupo diferente do já registrado
em `usuario.grupoEconomicoId`, e exige que o `superiorId` informado seja usuário do
mesmo grupo. `create` grava o grupo da empresa no momento da criação.

### 3. 3.3 Herança de dados de `Vendedor` pré-existente (`create`)

Ao criar um usuário, busca `Vendedor`s sem `usuarioId` com o mesmo e-mail na empresa e:
(a) usa `dadosDoVendedor()` para herdar `codigoErp`/`nomeReduzido`/`telefone`/
`dataNascimento` (só se o valor for único entre os vendedores encontrados — ver 3.5);
(b) após criar o usuário, vincula esses `Vendedor`s a ele (`usuarioId`). Sem isso, o
acesso nasceria sem carteira (o escopo hierárquico busca `Vendedor` pelo `usuarioId`).

### 4. 3.4 Resolução de vínculos no alcance do grupo (`findOne`)

`usuario_empresas` tem RLS por tenant — um `include` direto sem `withTenant` definido
mostraria "nenhuma empresa vinculada" para qualquer usuário. A função lê vínculo por
vínculo, uma chamada `withTenant` por empresa no alcance (a empresa ativa + demais do
mesmo grupo), e descarta os que não existem. Sem `empresaAtivaId` (uso interno), lê o
usuário via `withUsuario` e devolve sem vínculos resolvidos.

### 5. 3.5 Unificação de dados divergentes (`dadosDoVendedor`, em `common/usuarios/`)

Quando há mais de um `Vendedor` candidato com valores diferentes para o mesmo campo
(ex. dois `codigoErp` diferentes), a função descarta o campo (retorna `null`) em vez de
escolher um arbitrariamente — comentário explícito no código: "dados da conta são
únicos no grupo: não escolhe arbitrariamente uma empresa".

### 6. 3.6 WhatsApp replicado para `Vendedor` do grupo (`gravarWhatsappDoUsuario`)

Ao gravar celular/telefone do usuário (via `vincularEmpresa`), propaga o número
normalizado (`normalizarWhatsapp`, só dígitos) para o campo `telefone` de **todos** os
`Vendedor`es do usuário em todas as empresas do grupo — trocando o `app.current_empresa_id`
da sessão Postgres a cada empresa (RLS de `vendedor`) e restaurando a empresa de origem
no `finally`. Se o número mudou, apaga `WhatsappVinculoFuncionario` (precisa revincular).
Lança `ForbiddenException` se a empresa informada não estiver entre as do grupo do
usuário.

### 7. 3.7 Substituição em bloco do horário de trabalho (`salvarHorarios`)

Em vez de diff linha a linha, apaga todas as faixas do usuário e recria a partir do
payload (no máximo 7, uma por dia da semana), dentro de uma transação — uma falha no
meio não pode deixar `restringirHorario: true` com só parte da semana cadastrada (isso
trancaria o usuário fora do sistema em dias sem faixa). Após salvar, invalida o cache de
1 minuto do guard de horário (`horarioTrabalho.invalidar`) para a mudança valer
imediatamente.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PoliticaSenhaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`HorarioTrabalhoService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirVagaDeUsuario`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirPerfilDoGrupo`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`grupoDaEmpresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`gravarWhatsappDoUsuario`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`dadosDoVendedor`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`AuthModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`bcryptjs`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/usuarios` | 🟢 |

## Estado Interno e Entidades

- **`Usuario`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`UsuarioEmpresa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`UsuarioHorario`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

