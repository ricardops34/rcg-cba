# Convenção de migrations — Row-Level Security (multi-tenant)

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

## Exceções (tabelas com `empresaId` que **não** recebem RLS)

Documente o motivo na própria migration. Casos atuais:

- **`usuario_empresas`** — tabela de vínculo usada no login para descobrir a quais
  empresas o usuário pertence, **antes** de existir "empresa ativa" no contexto.
  Não há valor para o RLS filtrar contra. Filtro por usuário/empresa é feito pela
  aplicação em toda consulta.
- **`refresh_tokens`** — consultada por `tokenHash`/`usuarioId` no fluxo de
  login/refresh (via `this.prisma.refreshToken`, **sem** `withTenant`), antes de
  haver empresa ativa. A coluna `empresaId` é nullable e apenas informativa.

## Pré-requisitos operacionais

- RLS é **ignorada** por superusuário, por role com atributo `BYPASSRLS` e
  também pelo **dono da tabela** (mesmo sem `BYPASSRLS`), a menos que a tabela
  tenha `FORCE ROW LEVEL SECURITY`. A API deve sempre conectar com um role de
  aplicação distinto do role que roda as migrations/dono das tabelas.
- Esse role (`plataforma_app`) é criado pela migration
  `20260715221500_app_role_least_privilege`: `LOGIN`, `NOSUPERUSER`,
  `NOBYPASSRLS`, sem privilégio de DDL. `docker-compose.dev.yml` já usa esse
  role na `DATABASE_URL` do serviço `api` (migrations/seed continuam com o
  role dono, via serviço `db-init`). Em produção, troque a senha placeholder
  logo após o primeiro deploy — ver comentário em `docker/.env.prod.example`.

## Cobertura atual

Com RLS: `perfis`, `colaboradores`, `clientes`, `meta_vendedor_mes`, `notas_saida`, `produtos`, `titulos_receber`.
</content>
</invoke>
