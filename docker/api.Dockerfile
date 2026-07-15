# Imagem de PRODUÇÃO da API (NestJS). Build em duas etapas: compila tudo e o
# runtime fica só com deps de produção + dist. O código vai DENTRO da imagem
# (diferente do api.Dockerfile.dev, que usa bind mount + hot reload).
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/api.Dockerfile -t rcgcba-api .
#
# No boot o container aplica as migrations pendentes (prisma migrate deploy)
# antes de subir — por isso `prisma` é dependência de produção no package.json.

FROM node:20-alpine AS base
RUN npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @plataforma/api...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @plataforma/contracts build \
  && pnpm --filter @plataforma/api prisma:generate \
  && pnpm --filter @plataforma/api build

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @plataforma/api...
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
# Gera o Prisma Client dentro do node_modules de produção.
RUN pnpm --filter @plataforma/api exec prisma generate

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
