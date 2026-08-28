FROM node:20-alpine AS base
RUN npm install -g pnpm@10.0.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/portal-cliente/package.json apps/portal-cliente/

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm install --frozen-lockfile --filter portal-cliente...
COPY packages/contracts packages/contracts
COPY apps/portal-cliente apps/portal-cliente
RUN pnpm --filter @plataforma/contracts build && pnpm --filter portal-cliente build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3002
WORKDIR /app
COPY --from=build /app/apps/portal-cliente/.next/standalone ./
COPY --from=build /app/apps/portal-cliente/.next/static apps/portal-cliente/.next/static
COPY --from=build /app/apps/portal-cliente/public apps/portal-cliente/public
EXPOSE 3002
CMD ["node", "apps/portal-cliente/server.js"]
