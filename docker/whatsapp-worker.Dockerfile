# Imagem de PRODUÇÃO do worker de WhatsApp. Mesmo padrão de duas etapas da
# api.Dockerfile: compila e o runtime fica só com deps de produção + dist.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/whatsapp-worker.Dockerfile -t rcgcba-whatsapp-worker .
#
# Não roda migrations do Prisma: as tabelas de negócio são da API. O schema
# `whatsapp` e o role `whatsapp_store` vêm da migration 20260815024500, aplicada
# pela API; dentro desse schema é a biblioteca de sessão que faz o DDL, a cada
# conexão — por isso o worker conecta com `whatsapp_store`, e não com o
# DATABASE_URL da API. Ver docs/runbook-operacao.md.

FROM node:22-alpine AS base
RUN npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/whatsapp-worker/package.json apps/whatsapp-worker/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @plataforma/whatsapp-worker...
COPY apps/whatsapp-worker apps/whatsapp-worker
RUN pnpm --filter @plataforma/whatsapp-worker build

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @plataforma/whatsapp-worker...
COPY --from=build /app/apps/whatsapp-worker/dist apps/whatsapp-worker/dist

WORKDIR /app/apps/whatsapp-worker
EXPOSE 3100
CMD ["node", "dist/main.js"]
