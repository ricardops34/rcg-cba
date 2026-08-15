# Imagem de PRODUÇÃO do worker de WhatsApp. Mesmo padrão de duas etapas da
# api.Dockerfile: compila e o runtime fica só com deps de produção + dist.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/whatsapp-worker.Dockerfile -t rcgcba-whatsapp-worker .
#
# Não roda migrations: as tabelas de negócio são da API. O schema do store de
# sessão é criado pela própria biblioteca na primeira conexão.

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
