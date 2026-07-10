# AGENTS.md — rcgcba

Guia para agentes de IA e devs trabalhando neste monorepo (plataforma comercial
multi-tenant por empresa).

## Multi-tenant / Row-Level Security (RLS)

O isolamento entre empresas é reforçado pelo Postgres via **Row-Level Security**,
não apenas pelo `WHERE empresaId` da aplicação.

> **Toda migration que cria uma tabela com coluna `empresaId` de negócio DEVE
> habilitar RLS e criar a policy de isolamento na MESMA migration.**

```sql
ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_<tabela> ON "<tabela>"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
```

- `app.current_empresa_id` é setado por transação em `PrismaService.withTenant`
  (`apps/api/src/common/prisma/prisma.service.ts`). Todo acesso a tabela com RLS
  precisa passar por `withTenant(empresaId, ...)`.
- Exceções (sem RLS, por design — consultadas no login antes de haver empresa
  ativa): `usuario_empresas` e `refresh_tokens`. Documente o motivo na migration.
- Em produção, a API deve conectar com role de aplicação **sem** `BYPASSRLS`.

Detalhes e template completo: `apps/api/prisma/migrations/README.md`.
</content>
