# Convenção de migrations — Row-Level Security (multi-tenant)

> **A história começa em `20260828220000_baseline`.** As 73 migrations
> incrementais de 24/07 a 28/08/2026 foram consolidadas nela quando a base
> passou a ser criada do zero — o import do MySQL do portal antigo foi
> aposentado, e com ele a razão de preservar o caminho até o schema atual. A
> baseline tem três blocos: estrutura, role `plataforma_app` e RLS. Conteúdo
> (menus, rotinas, perfis, parâmetros, empresa inicial) continua sendo do
> `seed-base.ts`, nunca de migration.
>
> Quem já tinha o banco antigo aplicado precisa recriá-lo: o Prisma guarda o
> checksum de cada migration, e a história mudou.

Este projeto é multi-tenant por empresa. O isolamento **não** depende apenas do
`WHERE empresaId = ...` da aplicação: o Postgres reforça o corte por tenant com
**Row-Level Security (RLS)**, para que um bug de query ou um SQL manual não vaze
dados entre empresas.

## Regra

> **Toda tabela nova que tiver a coluna `empresaId` de negócio DEVE habilitar RLS
> e criar a policy de isolamento na mesma migration que cria a tabela.**

Não deixe para uma migration de RLS separada depois — a tabela nasce protegida.

### Template (cole no fim da migration que cria a tabela)

```sql
-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_<tabela> ON "<tabela>"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
```

O `app.current_empresa_id` é definido por transação em
[`PrismaService.withTenant`](../../src/common/prisma/prisma.service.ts) via
`set_config(...)`. Todo acesso a tabela com RLS **precisa** passar por
`withTenant(empresaId, ...)`, senão a policy filtra tudo (valor vazio) e a query
volta vazia.

## `usuario_empresas`: RLS com duas policies (tenant + self)

`usuario_empresas` carrega hierarquia/dados do vínculo
(ver `docs/regras-de-negocio.md`), então é dado de negócio e tem RLS — mas
precisa continuar sendo consultável **antes** de existir empresa ativa (login
descobrindo a quais empresas o usuário pertence; `AuthService.me()` listando
todas). Por isso tem uma policy extra, além da de tenant padrão:

```sql
CREATE POLICY tenant_isolation_usuario_empresas ON "usuario_empresas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY self_usuario_empresas ON "usuario_empresas"
  USING ("usuarioId" = current_setting('app.current_usuario_id', true));
```

Postgres combina policies permissivas com OR, então uma linha fica visível se
QUALQUER uma bater. `app.current_usuario_id` é setado por
[`PrismaService.withUsuario`](../../src/common/prisma/prisma.service.ts),
irmão do `withTenant`. Use `withUsuario` para consultar os vínculos do
**próprio** usuário logado (login, `me()`); use `withTenant` pra consultar
vínculos de outros usuários dentro da empresa ativa (admin gerenciando
usuários).

## Exceção (tabela com `empresaId` que **não** recebe RLS)

- **`refresh_tokens`** — consultada por `tokenHash`/`usuarioId` no fluxo de
  login/refresh (via `this.prisma.refreshToken`, **sem** `withTenant`), antes de
  haver empresa ativa. A coluna `empresaId` é nullable e apenas informativa.
- **`integracao_api_keys`** — consultada por `chaveHash` pelo `ApiKeyGuard`
  (ver `docs/planos/api-integracao-erp.md`) antes de existir `empresaId` de
  contexto: é essa consulta que descobre o tenant da requisição. Mesmo
  raciocínio de `refresh_tokens`.
- **`acessos_log`** e **`sessoes`** — escritas no fluxo de login (auditoria de
  acesso, ver `AcessosService`), antes de existir empresa ativa; no caso de uma
  tentativa sem sucesso, o e-mail digitado pode nem corresponder a um usuário.
  `empresaId` é nullable e informativo. O corte por empresa acontece na
  **consulta**: `AcessosService` restringe as três rotas de `/acessos` aos
  usuários com vínculo ativo na empresa da sessão, e só o perfil de sistema
  (`isAdmin`) enxerga tentativas de e-mail não cadastrado. Mexeu nessas
  consultas, mantenha esse filtro — aqui o Postgres não está segurando.
- **`usuario_horarios`** — horário de trabalho por usuário (restrição de
  expediente). Não tem `empresaId`: a trava é da conta, não do vínculo com uma
  empresa, como a política de senha.
- **`audit_logs`** (log de erros, ver `docs/planos/log-de-erros.md`) — quem lê
  é a administração da plataforma, e ela lê **todas** as empresas. Uma policy de
  tenant devolveria vazio justamente para quem precisa enxergar. Mesmo
  raciocínio de `plataforma_auditoria`, que também fica fora do isolamento. O
  `empresaId` é informativo e nulo quando o erro acontece antes de haver empresa
  ativa (login, refresh). O corte aqui é o `PlatformAdminGuard`, não o Postgres
  — mexeu na consulta, mantenha isso em mente.
  A tabela era órfã (model no schema, nenhuma escrita, 0 linhas) e foi ocupada
  pelo log de erros na migration `20260904140000_log_de_erros`; as colunas de
  auditoria de alteração que ela tinha saíram ali. `erros_log_config`, criada na
  mesma migration, é configuração da plataforma e nem sequer tem `empresaId`.

## Pré-requisitos operacionais

- RLS é **ignorada** por superusuário, por role com atributo `BYPASSRLS` e
  também pelo **dono da tabela** (mesmo sem `BYPASSRLS`), a menos que a tabela
  tenha `FORCE ROW LEVEL SECURITY`. A API deve sempre conectar com um role de
  aplicação distinto do role que roda as migrations/dono das tabelas.
- Esse role (`plataforma_app`) é criado no bloco 2 da baseline
  `20260828220000_baseline`: `LOGIN`, `NOSUPERUSER`,
  `NOBYPASSRLS`, sem privilégio de DDL. `docker-compose.dev.yml` já usa esse
  role na `DATABASE_URL` do serviço `api` (migrations/seed continuam com o
  role dono, via serviço `db-init`). Em produção, troque a senha placeholder
  logo após o primeiro deploy — ver comentário em `docker/.env.prod.example`.

## Cobertura atual

Com RLS: `usuario_empresas`, `produtos`, `vendedores`, `clientes`,
`categorias`, `condicoes_pagamento`, `armazens`, `estoques`, `tabelas_preco`,
`tabela_preco_itens`, `notas_saida`, `notas_saida_itens`, `titulos_receber`,
`objetivos_vendedor_mes`, `objetivos_vendedor_categoria`, `oportunidades`,
`atividades`, `orcamentos`, `orcamento_itens`, `cliente_campo_config`,
`orcamento_config`, `cliente_cnaes`, `whatsapp_sessoes`, `whatsapp_contatos`,
`whatsapp_conversas`, `whatsapp_mensagens`, `whatsapp_acoes`, `notificacoes`,
`portal_cliente_credenciais` e `portal_cliente_acessos_log`. As duas últimas
usam policies pré-tenant estreitas, configuradas por `withPortalCredential` e
`withPortalAudit`, além da policy normal de tenant.

`integracao_api_keys`, `acessos_log`, `sessoes` e `audit_logs` têm `empresaId`
mas estão na lista de exceções acima (não recebem RLS — as três primeiras pelo
mesmo motivo de `refresh_tokens`, `audit_logs` porque quem a lê lê todas as
empresas).

Sem RLS por serem referência global (sem coluna `empresaId`): `paises`,
`estados`, `municipios`, `ceps`, `cnaes` (além das tabelas de sistema
`modulos`/`menus`/`rotinas`, de `politica_senha`/`senha_historico` — login e
senha são globais — e de `perfis`: um
mesmo papel/RBAC, ex. "Administrador"/"Vendedor", é compartilhado por todas
as empresas; cada vínculo usuário×empresa continua escolhendo seu próprio
perfil dessa lista global).
</content>
</invoke>
