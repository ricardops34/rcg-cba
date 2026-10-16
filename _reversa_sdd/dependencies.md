# Dependências — plataforma-comercial (rcg)

> Gerado pelo Scout em 2026-10-15. Versões conforme `package.json` de cada workspace
> (ranges `^`, não resolvidas via lockfile).

## Raiz (`package.json`)

| Pacote | Versão | Tipo |
|---|---|---|
| turbo | ^2.3.3 | dev |
| typescript | ^5.7.3 | dev |

Gerenciador: **pnpm@10.0.0** (workspace), orquestração via **Turborepo**.

## `apps/api` (@plataforma/api) — NestJS

### Dependências

| Pacote | Versão |
|---|---|
| @nestjs/common, @nestjs/core, @nestjs/platform-express | ^11.0.1 |
| @nestjs/config | ^4.0.0 |
| @nestjs/jwt, @nestjs/passport | ^11.0.0 / ^11.0.5 |
| @nestjs/serve-static | ^5.0.5 |
| @nestjs/swagger | ^11.4.5 |
| @nestjs/throttler | ^6.4.0 |
| @prisma/client, prisma | ^6.2.1 |
| @anthropic-ai/sdk | ^0.117.1 |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | ^3.1150.0 |
| @plataforma/contracts | workspace:* |
| archiver | ^7.0.1 |
| bcryptjs | ^2.4.3 |
| class-transformer, class-validator | ^0.5.1 / ^0.14.1 |
| helmet | ^8.0.0 |
| jspdf, jspdf-autotable | ^4.2.1 / ^5.0.8 |
| multer | ^2.2.0 |
| nestjs-zod | ^5.4.0 |
| nodemailer | ^9.0.3 |
| passport, passport-jwt | ^0.7.0 / ^4.0.1 |
| reflect-metadata | ^0.2.2 |
| rxjs | ^7.8.1 |
| zod | ^3.25.76 |

### Dev dependencies

jest ^30, ts-jest, ts-node, ts-loader, eslint ^9 + typescript-eslint ^8, prettier ^3.4.2,
supertest ^7, @nestjs/cli, @nestjs/testing, tsconfig-paths.

## `apps/web` (web) — Next.js

| Pacote | Versão |
|---|---|
| next | 16.2.10 |
| react, react-dom | 19.2.4 |
| @tanstack/react-query | ^5.62.11 |
| zustand | ^5.0.2 |
| react-hook-form, @hookform/resolvers | ^7.54.2 / ^3.10.0 |
| radix-ui | ^1.6.2 |
| @dnd-kit/core, sortable, utilities | ^6.3.1 / ^10.0.0 / ^3.2.2 |
| shadcn | ^4.13.0 |
| tailwindcss (dev), @tailwindcss/postcss | ^4 |
| class-variance-authority, clsx, tailwind-merge | ^0.7.1 / ^2.1.1 / ^3.6.0 |
| cmdk | ^1.1.1 |
| jspdf, jspdf-autotable | ^4.2.1 / ^5.0.8 |
| qrcode | ^1.5.4 |
| sonner | ^2.0.7 |
| xlsx | ^0.18.5 |
| zod | ^3.25.76 |
| @plataforma/contracts | workspace:* |

## `apps/portal-cliente` — Next.js

| Pacote | Versão |
|---|---|
| next | 16.2.10 |
| react, react-dom | 19.2.4 |
| lucide-react | ^1.23.0 |
| @plataforma/contracts | workspace:* |

Workspace enxuto — ainda em estágio inicial (poucas dependências próprias).

## `apps/whatsapp-worker` (@plataforma/whatsapp-worker)

| Pacote | Versão |
|---|---|
| zapo-js | ^1.7.1 |
| @zapo-js/store-postgres | ^1.1.0 |

Sem framework HTTP — worker standalone compilado com `tsc`.

## `packages/contracts` (@plataforma/contracts)

| Pacote | Versão |
|---|---|
| zod | ^3.25.76 |

Fonte única de schemas Zod compartilhados entre api/web/portal-cliente.

## `packages/config` (@plataforma/config)

Sem dependências próprias — expõe apenas `tsconfig.base.json` para os demais workspaces.

## Observações

- Versões de `next`/`react` iguais entre `web` e `portal-cliente` (16.2.10 / 19.2.4),
  mantendo os dois frontends no mesmo major.
- `zod` é a base de validação compartilhada entre API e contracts.
- Nenhuma dependência de observabilidade/APM (ex. Sentry, Datadog) encontrada nos
  `package.json` — não há evidência de monitoramento de erros centralizado no código.
