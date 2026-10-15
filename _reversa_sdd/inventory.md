# Inventário do Projeto — plataforma-comercial (rcg)

> Gerado pelo Scout em 2026-10-15

## Visão geral

Monorepo pnpm + Turborepo com 4 apps e 2 pacotes compartilhados, implementando uma
plataforma comercial multi-tenant (CRM/ERP comercial): clientes, orçamentos, estoque,
notas de entrada/saída, títulos a receber, relatórios, WhatsApp e um agente de IA.

## Estrutura de pastas (raiz)

```
apps/
  api/              NestJS — backend principal (API REST)
  web/              Next.js 16 — aplicação interna (vendedores, gestão)
  portal-cliente/   Next.js 16 — portal do cliente final
  whatsapp-worker/  Worker Node — integração WhatsApp (zapo-js)
packages/
  contracts/        Contratos compartilhados (schemas Zod) entre api/web/portal
  config/           Config compartilhada (tsconfig base)
docker/             Dockerfiles e stacks de deploy (dev + prod)
docs/               Runbook de operação, regras de negócio, segurança, integração ADVPL
scripts/            db-migrate, deploy, seed-base, validar-tours
imagens/, prints_manual/   Material de documentação/manual do usuário
```

## Linguagens (contagem de arquivos, excl. node_modules/dist/.next)

| Linguagem | Extensões | Arquivos |
|---|---|---|
| TypeScript | .ts | 740 |
| TypeScript JSX | .tsx | 305 |
| SQL | .sql | 141 |
| JSON | .json | 17 |
| Prisma Schema | .prisma | 1 |

**Linguagem principal:** TypeScript

## Frameworks e bibliotecas principais

- **apps/api**: NestJS 11, Prisma 6 (Postgres), Passport/JWT, class-validator, nestjs-zod,
  Zod, Swagger, Throttler, AWS S3 SDK, Anthropic SDK (agente de IA), jsPDF, Nodemailer
- **apps/web**: Next.js 16, React 19, TanStack Query, Zustand, React Hook Form,
  Radix UI, Tailwind CSS 4, dnd-kit, shadcn
- **apps/portal-cliente**: Next.js 16, React 19 (app menor, só contratos + lucide-react)
- **apps/whatsapp-worker**: zapo-js + @zapo-js/store-postgres (worker standalone, sem framework HTTP)
- **packages/contracts**: Zod (fonte única de schemas compartilhados)

## Gerenciador de pacotes

pnpm (workspace), orquestrado por Turborepo (`turbo.json`)

## Módulos de negócio identificados (apps/api/src/modules — 55)

acessos, agente, armazenamento, assinaturas, atividades, auth, backup-empresa, cadastros,
cliente-campo-config, clientes, consultas, contas-bancarias, demo, documentos-email, email,
empresas, equipamentos-comodato, erros, escopo, estoque, estrutura, feriados, fornecedores,
grupos-economicos, inicio, integracao, integracao-keys, leads, meus-atendimentos,
notas-entrada, notas-saida, notificacoes, objetivos, oportunidades, orcamento-config,
orcamentos, parametros, perfis, planos, plataforma, politica-senha, portal-cliente,
produto-campos, produtos, recuperacao-senha, relatorios, sms, sugestao-compra,
suporte-acesso, termos, titulos-receber, tours, usuarios, vendedores, whatsapp

## Pontos de entrada

| Caminho | Tipo |
|---|---|
| `apps/api/src/main.ts` (implícito via `nest start`) | server_entry |
| `apps/web/src/app/(app)/` | app_entry (área autenticada) |
| `apps/web/src/app/login/` | app_entry (login) |
| `apps/portal-cliente/src/app/` | app_entry |
| `apps/whatsapp-worker/src/main.ts` (via `node dist/main.js`) | worker_entry |

## Configuração

- `.env.example` não encontrado na raiz; exemplos ficam em `docker/.env.*.example`
- `turbo.json`, `pnpm-workspace.yaml`, `tsconfig` por app
- `docker/docker-compose.dev.yml` — ambiente de desenvolvimento
- Stacks de produção: `stack.rcgcba.prod.yml`, `stack.portal-cliente.yml`,
  `stack.evolution-api.prod.yml`, `stack.evolution-go.prod.yml`, `stack.servicos.prod.yml`

## CI/CD

Nenhum pipeline de CI/CD (`.github/workflows/`) encontrado. Único arquivo em `.github/` é
uma instrução de editor (`tds-vscode-1-0-2.instructions.md`), não um workflow.
Deploy é manual via `scripts/deploy.sh` e `publish.ps1` (ver `docs/runbook-operacao.md`).

## Docker

- Dockerfiles por app: `api.Dockerfile` (+ `.dev`), `web.Dockerfile` (+ `.dev`),
  `portal-cliente.Dockerfile` (+ `.dev`), `whatsapp-worker.Dockerfile` (+ `.dev`),
  `api-scripts.Dockerfile`
- Compose de dev: `docker-compose.dev.yml`
- Stacks Swarm de produção (múltiplos serviços)

## Banco de dados (superficial)

- `apps/api/prisma/schema.prisma` — schema Prisma (Postgres)
- `apps/api/prisma/migrations/` — histórico de migrations SQL
- Scripts de dados: `seed-base.ts`, `demo-dados.ts`, `sync-ibge.ts`, `enrich-cnae.ts`,
  `catalogo-sistema.ts`, `sincronizar-catalogo.ts`
- Multi-tenant via RLS (Row Level Security) com dois papéis de banco: `plataforma`
  (DDL/migrations) e `plataforma_app` (runtime, `NOBYPASSRLS`) — ver
  `apps/api/prisma/migrations/README.md` e `docs/runbook-operacao.md`

Análise detalhada do schema será feita pelo `reversa-data-master`.

## Cobertura de testes

- Framework: Jest (configurado em `apps/api/package.json`)
- 113 arquivos `*.spec.ts` encontrados (apenas em `apps/api`; nenhum `*.test.*` no monorepo)
- `apps/web`, `apps/portal-cliente` e `apps/whatsapp-worker` não têm testes automatizados aparentes

## Histórico

422 commits no branch `main` até a data desta extração.
