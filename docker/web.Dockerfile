# Imagem de PRODUÇÃO do web (Next.js). Usa o output standalone do Next
# (next.config.ts: output "standalone"), que embute só o necessário no runtime.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/web.Dockerfile -t rcgcba-web .
#
# IMAGEM ÚNICA, para todos os clientes: a API é chamada pelo MESMO endereço em
# que o usuário abriu o sistema (`/api/v1`, relativo). Quem decide para onde
# `/api` e `/uploads` vão é a stack (roteador do Traefik por domínio) — ver
# docs/runbook-operacao.md, "Imagem única e um domínio por cliente". Cliente
# novo é configuração, não build.
#
# ATENÇÃO: NEXT_PUBLIC_* é inlined no BUILD (não adianta mudar em runtime). Por
# isso o padrão é o relativo: um endereço absoluto aqui amarraria a imagem a um
# cliente e faria o cookie de sessão virar "de terceiros" nos demais domínios.

FROM node:20-alpine AS base
RUN --mount=type=secret,id=npm_ca,required=false \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/

FROM base AS build
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_VERSION=1.0
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
RUN --mount=type=secret,id=npm_ca,required=false \
  --mount=type=cache,id=rcgcba-pnpm-store-node20,target=/root/.local/share/pnpm/store,sharing=locked \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  pnpm install --frozen-lockfile --filter web...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN --mount=type=secret,id=npm_ca,required=false \
  if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  pnpm --filter @plataforma/contracts build \
  && pnpm --filter web build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
