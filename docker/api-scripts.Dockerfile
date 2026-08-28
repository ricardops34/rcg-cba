# Imagem enxuta só com os scripts de seed/importação (apps/api/prisma/*.ts),
# compilados pra JS puro e rodando com "node" direto — sem NestJS, sem
# ts-node, sem as devDependencies do app inteiro (esses scripts só usam
# @prisma/client, mysql2 e bcryptjs). Feita pra deploy via Portainer Stack em
# Swarm, onde não dá pra usar `build:`/bind-mount do repo.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/api-importer.Dockerfile -t bjsoftware/rcgcba-importer:latest .
#
# Uso (Portainer Stack/serviço avulso) — comando do container. O WORKDIR é
# /app/apps/api e os scripts compilados ficam em prisma/dist (outDir de
# prisma/tsconfig.scripts.json), não em dist:
#   node prisma/dist/seed-base.js
#   node prisma/dist/import-auxiliares.js && node prisma/dist/import-legado.js && node prisma/dist/import-tabela-preco.js && node prisma/dist/import-clientes.js && node prisma/dist/import-negocio.js && node prisma/dist/import-objetivos.js
# Variáveis de ambiente: DATABASE_URL (role DONO, não plataforma_app — os
# scripts bypassam RLS/fazem DDL do zero se rodando prisma migrate à parte),
# MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
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
