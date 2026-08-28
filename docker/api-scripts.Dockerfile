# Imagem enxuta só com os scripts de manutenção da base (apps/api/prisma/*.ts),
# compilados pra JS puro e rodando com "node" direto — sem NestJS, sem
# ts-node, sem as devDependencies do app inteiro (esses scripts só usam
# @prisma/client e bcryptjs). Feita pra deploy via Portainer Stack em
# Swarm, onde não dá pra usar `build:`/bind-mount do repo.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/api-scripts.Dockerfile -t bjsoftware/rcgcba-scripts:latest .
#
# Uso (Portainer Stack/serviço avulso) — comando do container. O WORKDIR é
# /app/apps/api e os scripts compilados ficam em prisma/dist (outDir de
# prisma/tsconfig.scripts.json), não em dist:
#   node prisma/dist/seed-base.js     # base nova: estrutura + admin + referências IBGE
#   node prisma/dist/sync-ibge.js     # ressincronizar países/UFs/municípios/CNAEs
#   node prisma/dist/enrich-cnae.js   # CNAE dos clientes, via MinhaReceita
#
# Os importadores do MySQL legado foram removidos em 2026-08-28 junto com o
# resto daquele caminho — a base nasce do seed e das APIs públicas.
#
# Variáveis de ambiente: DATABASE_URL (role DONO, não plataforma_app — os
# scripts bypassam RLS).
# Sem restart policy — é um job de rodar uma vez e sair.

FROM node:20-alpine AS base
RUN npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @plataforma/api...
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm exec tsc -p prisma/tsconfig.scripts.json

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @plataforma/api...
WORKDIR /app/apps/api
COPY apps/api/prisma/schema.prisma prisma/schema.prisma
RUN pnpm exec prisma generate
COPY --from=build /app/apps/api/prisma/dist prisma/dist

CMD ["node", "prisma/dist/seed-base.js"]
