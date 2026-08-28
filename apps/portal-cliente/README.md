# Portal do Cliente

Aplicação Next.js independente do App Comercial. Consome exclusivamente a API
em `NEXT_PUBLIC_API_URL`; não acessa banco de dados nem importa código de
`apps/web`.

## Desenvolvimento

```bash
pnpm --filter portal-cliente dev
```

A porta padrão é `3002`. Copie `.env.example` para `.env.local` e ajuste a URL
da API quando necessário.

## Imagem e stack independentes

`NEXT_PUBLIC_API_URL` é incorporada durante o build:

```bash
docker build -f docker/portal-cliente.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.exemplo.com/api/v1 \
  -t rcgcba-portal-cliente:latest .
```

Para publicar no Swarm, informe `PORTAL_CLIENTE_HOST` e, opcionalmente,
`PORTAL_CLIENTE_IMAGE`, então utilize `docker/stack.portal-cliente.yml`.

O domínio do Portal também precisa constar em `CORS_ORIGIN` na stack da API.
