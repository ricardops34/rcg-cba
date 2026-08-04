---
name: security-audit
description: Audits this platform (NestJS + Prisma + Postgres RLS + Next.js) for security vulnerabilities using an OWASP-based checklist tailored to the project's own architecture (guard/permission pattern, multi-tenant RLS, JWT auth, file uploads). Use when the user asks for a security audit, pentest, vulnerability scan, or "is this secure" style question about apps/api or apps/web. Produces a written report and can fix confirmed findings.
license: MIT
metadata:
  domain: security
  scope: audit + remediation
  output-format: findings report (markdown) + optional code fixes
---

# Security Audit — Plataforma Comercial (rcgcba)

Read-only investigation first, then (if asked) remediation, then a written
report. Don't skip straight to "looks fine" — every claim below needs a
file:line citation or a live test result, not a guess.

## How to run this

1. Read this whole file before starting — it encodes lessons already learned
   about this specific codebase (which patterns are *expected* and safe vs.
   which look similar but aren't).
2. Work through the checklist below. For anything you can check statically
   (grep + read), do that first — it's cheap and precise. Reserve live
   `curl`/API calls against the running dev stack for things that can't be
   verified by reading code (e.g. "does the throttler guard actually reject
   the 11th request").
3. If you find something, verify it's real before reporting it: read the
   full code path, don't infer from a function name. A grep hit is a lead,
   not a finding.
4. If asked to fix: fix the root cause with the smallest safe change, prefer
   fail-fast over silent fallback, rebuild (`nest build` / `next build`) to
   confirm the fix compiles, and re-verify the specific check that flagged it.
5. Write the final report (see "Report format" below) — don't just leave
   findings scattered across chat turns.

## Architecture context (already true here — don't re-derive, do verify it still holds)

- Every controller uses `@UseGuards(JwtAuthGuard, PermissionsGuard)` at the
  class level, with `@RequirePermission(rotina, acao)` per mutating route.
  `PermissionsGuard` (`apps/api/src/common/guards/permissions.guard.ts`)
  short-circuits to `return true` when `user.isAdmin` (`Perfil.sistemaBase`).
- Multi-tenant isolation is enforced by Postgres **Row-Level Security**
  (`tenant_isolation_<table>` policies), set per-transaction via
  `PrismaService.withTenant(empresaId, ...)` (`set_config('app.current_empresa_id', ...)`).
  Every table with a business `empresaId` column MUST have RLS enabled in the
  migration that creates it — see `apps/api/prisma/migrations/README.md`.
- The API's runtime DB connection uses the least-privilege `plataforma_app`
  Postgres role (`NOSUPERUSER`, `NOBYPASSRLS`) — migrations/seed run under a
  separate owner role. RLS is silently bypassed by superusers/table owners,
  so this separation is load-bearing, not cosmetic.
- Vendor-scoped (hierarchical) data access goes through
  `resolverEscopoVendedores`/`combinarFiltroVendedor`
  (`apps/api/src/common/escopo/escopo-vendedores.ts`) — returns `null`
  (unrestricted) for admins and for any user with no linked `Vendedor` row.
- Refresh tokens are opaque random values (`randomBytes`), hashed at rest,
  rotated + revoked on use — not JWTs. `JWT_REFRESH_SECRET` in env is
  legacy/unused; don't flag it as a "secret with no purpose" without checking
  whether anything actually reads it first.

## Checklist

### A. AuthN/AuthZ
- [ ] Every `@Controller` under `apps/api/src/modules/**` has the guard
      stack, OR has a written justification for why not (pre-auth routes
      like login/refresh; genuinely public/low-sensitivity reads). List every
      controller and its guard status — don't sample.
- [ ] Every POST/PATCH/PUT/DELETE route has `@RequirePermission`.
- [ ] `PermissionsGuard`'s admin bypass (`isAdmin` → `sistemaBase`) is the
      *only* elevation path — grep for any other place that checks
      `sistemaBase` or grants broad access, and confirm no perfil other than
      the intended "Administrador" can get `sistemaBase: true` through normal
      app flows (not just the seed).
- [ ] JWT verification (`apps/api/src/modules/auth/strategies/jwt.strategy.ts`)
      has no hardcoded fallback secret. This is the #1 recurring finding in
      Node/Nest apps — check it every time, even if it was fixed before.
- [ ] Account lockout (`Usuario.tentativasFalhas`/`bloqueadoAte`) is actually
      read/written in `auth.service.ts`, not just declared in the schema.
- [ ] Global rate limiting: `ThrottlerModule` is imported in `app.module.ts`
      AND actually bound (`APP_GUARD` → `ThrottlerGuard`, or per-route
      `@UseGuards(ThrottlerGuard)`). Importing the module alone does nothing.
      Confirm login (and any other unauthenticated route) has a strict
      per-IP `@Throttle(...)` on top of the global default.

### B. Multi-tenant isolation
- [ ] Cross-check every model in `schema.prisma` with an `empresaId` column
      against `apps/api/prisma/migrations/README.md`'s "Cobertura atual"
      list AND the actual migration SQL (`ENABLE ROW LEVEL SECURITY` +
      `CREATE POLICY`) — the README can drift, the DB is the source of
      truth. Flag both directions: missing RLS, and README saying "no RLS"
      for something that has an `empresaId`.
- [ ] Spot-check a couple of services' `findOne`/`update`/`remove` methods to
      confirm they scope by `empresaId` (belt-and-suspenders on top of RLS —
      defense in depth, not redundant) and go through `withTenant`.
- [ ] Any raw SQL (`$queryRaw`/`$executeRaw`) still runs inside a
      `withTenant` transaction so RLS applies to it too.

### C. Injection
- [ ] Grep `$queryRawUnsafe`/`$executeRawUnsafe` — should be zero hits.
- [ ] Every `$queryRaw`/`$executeRaw` uses tagged-template parameterization
      (`` prisma.$queryRaw`...${value}...` ``), never string concatenation.
- [ ] Any hand-built dynamic query (e.g. `Prisma.sql`/`Prisma.join` for
      search/sort) constrains sort fields/columns to a hardcoded whitelist,
      never interpolates a raw client-supplied column/direction string.

### D. Secrets & config
- [ ] No real credentials committed (grep for key-shaped strings; distinguish
      obvious dev placeholders like `..._dev_only` from anything
      production-looking).
- [ ] `.env` files with real values are git-ignored, `.env.example`/prod
      example files contain only placeholders with rotation instructions.
- [ ] No secret has a silent code-level fallback default (see JWT above —
      this applies to any secret: session, encryption, webhook signing, etc.)

### E. File uploads (if any exist)
- [ ] MIME/type validation exists — note whether it trusts the client-sent
      `mimetype` header (spoofable) vs. sniffing actual file content.
- [ ] The stored filename is **never** derived from client input (route
      params, `file.originalname`, form fields) without validation. Multer's
      `diskStorage.filename` callback is NOT sanitized by multer itself — a
      value containing `../` writes outside the intended directory. Prefer
      server-generated filenames (`randomUUID()`) over anything
      client-influenced. This is easy to miss because the vulnerable code
      looks completely ordinary (`${req.params.id}-${Date.now()}${ext}`).
- [ ] File size limits are enforced (`limits.fileSize`).
- [ ] If SVG is an accepted type, confirm CSP (`script-src`) blocks inline
      script execution for anything served from the uploads path.

### F. Transport / headers
- [ ] `helmet()` (or equivalent) is applied in `main.ts`, and any override of
      its defaults (e.g. `crossOriginResourcePolicy`) has a documented reason.
- [ ] CORS origin is a specific value from env, never `*`, especially not
      combined with `credentials: true`.
- [ ] Swagger/OpenAPI docs endpoint (`/api/docs`) — note whether it's
      publicly reachable; not automatically a bug, but call it out as a
      conscious decision to confirm for prod.

### G. Business-logic / escopo bypass (specific to this app)
- [ ] For any new module added since the last audit, confirm it follows the
      established `garantirClienteNoEscopo`/`garantirVendedorNoEscopo`/
      `garantirOportunidadeNoEscopo`-style guard pattern before trusting a
      client-supplied foreign key (clienteId, vendedorId, oportunidadeId,
      etc.) — a user could otherwise pass an ID belonging to another
      vendor's portfolio and read/link data outside their scope even though
      RLS stops cross-*tenant* leakage (RLS doesn't stop cross-*vendor*
      leakage within the same tenant — that's what these helpers are for).

### H. Live verification (when static reading isn't conclusive)
Use a throwaway request against the running dev stack (`docker compose`
services already up) — never against anything but the local dev environment:
- Rate limiting: fire >configured-limit requests at a throttled route in a
  tight loop, confirm a `429` shows up.
- Auth bypass: confirm an unauthenticated request to a protected route 401s,
  and a request with a permission the test user doesn't have 403s (reuse the
  session's established temp-test-user pattern — create, test, tear down
  fully, never leave test users behind).
- Don't perform an actual destructive exploit (e.g. don't really try to write
  a file outside the uploads dir) if the code reading already proves the bug
  — fix it instead of demonstrating it further.

## Report format

Write findings to `docs/seguranca/relatorio-<YYYY-MM-DD>.md` (create the
`docs/seguranca/` directory if it doesn't exist). Structure:

```markdown
# Relatório de auditoria de segurança — <data>

## Resumo
<2-4 sentences: what was audited, overall verdict, count of findings by severity>

## Findings
### [SEVERITY] Title
- **Local**: file:line
- **Descrição**: what's wrong
- **Impacto**: concrete failure scenario (who can do what, under what condition)
- **Status**: Corrigido (commit/diff) | Não corrigido (motivo) | Falso positivo (motivo)

## Checklist executado
<one line per checklist section above: OK / CONCERN / GAP, with a pointer to the finding if not OK>
```

Severity scale: **Critical** (auth bypass, cross-tenant data leak, RCE) /
**High** (privilege escalation within tenant, path traversal, injection) /
**Medium** (missing defense-in-depth, DoS-able endpoint) / **Low**
(documentation drift, hardening opportunity, no realistic exploit path).

Keep the report factual and evidence-based — every finding needs a file:line
or a reproducible test, matching the standard this file itself asks you to
hold findings to.
