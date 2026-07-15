# Imagem de PRODUÇÃO do web (Next.js). Usa o output standalone do Next
# (next.config.ts: output "standalone"), que embute só o necessário no runtime.
#
# Contexto de build: a RAIZ do repositório.
#   docker build -f docker/web.Dockerfile -t rcgcba-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.rcgcba.bjsoft.com.br/api/v1 .
#
# ATENÇÃO: NEXT_PUBLIC_* é inlined no BUILD (não adianta mudar em runtime).

FROM node:20-alpine AS base
RUN npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/

FROM base AS build
ARG NEXT_PUBLIC_API_URL=https://api.rcgcba.bjsoft.com.br/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm install --frozen-lockfile --filter web...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @plataforma/contracts build \
  && pnpm --filter web build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
