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
  && pnpm --filter @plataforma/api build \
  && pnpm --filter @plataforma/api exec tsc -p prisma/tsconfig.scripts.json

FROM base AS runtime
ENV NODE_ENV=production
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --prod --filter @plataforma/api... \
  && pnpm --filter @plataforma/api exec prisma generate \
  && pnpm store prune \
  && rm -rf /root/.local/share/pnpm/store /root/.cache /root/.npm
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# Scripts de seed/importação (apps/api/prisma/*.ts) já compilados pra JS puro
# — dá pra rodar com "node prisma/dist/seed-base.js" num serviço avulso na
# mesma stack, sem precisar de imagem/stack separada. Os import-*.js também
# rodam aqui: mysql2 e bcryptjs são dependências de produção. Passe um
# DATABASE_URL com a role DONA (não plataforma_app): os scripts rodam fora do
# Nest e setam o tenant na mão, então precisam contornar a RLS.
COPY --from=build /app/apps/api/prisma/dist apps/api/prisma/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
