# portal-cliente — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `portal-cliente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Guard` | `Comportamento` | 200 OK |
| `POST /portal-cliente/auth/login` | `público, `@Throttle` 10/min` | ``{empresaAlias, email, senha}` → `{accessToken, refreshToken, expiresIn: 900}`` | 200 OK |
| `POST /portal-cliente/auth/refresh` | `público` | `troca o refresh por um novo par (rotação)` | 200 OK |
| `POST /portal-cliente/auth/logout` | `público` | `revoga a sessão do refresh enviado` | 200 OK |
| `GET /portal-cliente/me` | ``PortalClienteGuard`` | `contato, cliente, empresa, permissões, config` | 200 OK |
| `GET /portal-cliente/orcamentos` | `idem + `orcamentos.visualizar`` | `orçamentos do cliente em `enviado/aprovado/recusado/expirado`, `origem ≠ erp`` | 200 OK |
| `PATCH /portal-cliente/orcamentos/:id/aprovar {observacao?}` | `idem + `orcamentos.aprovar`` | `decide` | 200 OK |
| `PATCH /portal-cliente/orcamentos/:id/recusar {observacao?}` | `idem + `orcamentos.recusar`` | `decide` | 200 OK |
| `GET/PUT /portal-cliente-admin/config` | `JWT interno, `clientes.visualizar`/`editar`` | `lê/grava a configuração da empresa` | 200 OK |
| `POST /portal-cliente-admin/acessos` | `JWT interno, `clientes.editar`` | `cria o acesso de um contato` | 200 OK |

## Fluxo Principal

### 1. 3.1 Login

1. `empresaAlias` e `email` em minúsculas; busca a credencial por `(empresaAlias, emailNormalizado)`
   com `withPortalCredential` (policy pré-tenant da tabela `portal_cliente_credenciais`, que abre
   só a linha exata do contexto).
2. `bloqueadoAte` no futuro → **423** "Conta temporariamente bloqueada" (antes de conferir a senha).
3. Credencial inexistente, inativa ou senha errada (`bcrypt`) → grava `login_falha` em
   `portal_cliente_acessos_log` (policy só de INSERT) e, se a credencial existe, soma
   `tentativasFalhas`; **5 falhas → bloqueio de 15 min**. Resposta 401 "Credenciais inválidas".
4. Senha certa: `emitir`, zera tentativas, grava `ultimoLogin` e `login_sucesso`.

### 2. 3.2 `emitir` e `contexto`

`contexto` (em `withTenant`) exige: contato `ativo`, cliente `ativo`, `portalHabilitacao.ativo` do
cliente e `portalClienteConfig.ativo` da empresa — senão 401 "Acesso ao portal não habilitado".
As permissões viram `"<rotina>.<acao>"` do perfil do contato (só `permitido = true`).
O **access token** (JWT, secret próprio, `aud: portal-cliente`, **15 min**) leva `empresaId`,
`clienteId`, `contatoId`, `perfilId`, nome, e-mail e a **lista de permissões**. O **refresh** é
`randomBytes(48)` base64url, guardado só como SHA-256 em `portal_cliente_sessoes` (30 dias, com IP e
navegador).

### 3. 3.3 Refresh

Acha a sessão pelo hash; recusa se não existe, está revogada, vencida ou se a credencial está
inativa (401 "Sessão inválida"). **Revoga a sessão antiga e emite outra** (rotação), e `emitir`
refaz o `contexto` (refaz as permissões a partir do banco). Logout revoga sem exigir token válido.

### 4. 3.4 Guard e estratégia

`PortalClienteStrategy` valida só a assinatura e a validade (`audience` fixo); **não consulta o banco**:
o usuário da requisição é o conteúdo do token. A API **não sobe** sem `PORTAL_JWT_ACCESS_SECRET`
(erro no construtor da estratégia), mesmo sem nenhum cliente usando o portal.

### 5. 3.5 Orçamentos do portal

- **Listar:** `withTenant`, filtra por empresa **e** `clienteId` do token. Devolve itens,
  `percDesconto`, nome do vendedor, condição de pagamento, `observacao` e a decisão anterior.
- **Decidir:** exige a permissão `orcamentos.aprovar` ou `.recusar` do token. Acha o orçamento da empresa
  e do cliente. Já decidido igual → devolve o registro (idempotente). Status ≠ `enviado` → 409.
  Validade vencida → tenta gravar `expirado` e responde 409. Senão grava `status`, `clienteDecididoEm`,
  `clienteDecididoPorContatoId`, `clienteDecisao`, `clienteDecisaoObservacao`,
  `updatedBy = portal-cliente:<contatoId>` e cria uma **Atividade** concluída (`tarefa`) na timeline do cliente.

Efeito colateral do `aprovado`: o orçamento passa a atender o filtro da fila
`GET /integracao/orcamentos/pendentes` (`status = aprovado`, sem chave, sem erro) e **vai ao ERP**.

### 6. 3.6 Administração: criar acesso

Em uma transação: exige `empresa.alias` e empresa acessível (`whereEmpresaAcessivel`); cliente
ativo da empresa. Sem `perfilId`, cria/reativa o perfil **"Administrador do cliente"**
(`sistemaBase`) com **todas** as rotinas ativas do catálogo (ações por rotina em `ACOES`) — erro
se o catálogo estiver vazio. Com `perfilId`, confere que existe e está ativo. O contato é
procurado por e-mail no cliente (sem diferenciar maiúsculas): existindo, **atualiza** nome,
telefone, celular, cargo, `principal`, `ativo` e perfil; senão, cria. Se o contato ou o par
`(alias, e-mail)` já tem credencial → 409. Liga a habilitação do cliente, cria a config da empresa
(`ativo: true`, se não existir) e a credencial com `senhaInicial` em `bcrypt` custo 12.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService (withPortalCredential, withPortalAudit, withTenant)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@nestjs/jwt`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`bcryptjs`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`whereEmpresaAcessivel`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/portal-cliente` | 🟢 |

## Estado Interno e Entidades

- **`PortalClienteConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClientePerfil`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClienteRotina`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClientePerfilPermissao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClienteHabilitacao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClienteCredencial`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClienteSessao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PortalClienteAcessoLog`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

