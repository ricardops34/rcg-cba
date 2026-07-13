#!/usr/bin/env bash
#
# Deploy dos ajustes de login por empresa (alias/branding) + upload de logo.
# Idempotente: pode rodar quantas vezes precisar na VPS.
#
# O que este script cobre:
#   - dependências novas (@nestjs/serve-static, multer, @types/multer)
#   - build de contracts -> api -> web (ordem importa: web/api usam contracts)
#   - migration nova do Prisma (empresas.alias / empresas.logoUrl)
#   - diretório de uploads persistente (logos das empresas)
#   - restart dos serviços (detecta pm2, senão docker compose, senão avisa)
#
# Uso na VPS (a partir da raiz do repositório):
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Variáveis de ambiente relevantes (devem já estar configuradas na VPS):
#   DATABASE_URL           -> usado pelo prisma migrate deploy (apps/api/.env)
#   NEXT_PUBLIC_API_URL    -> origem da API usada pelo web (build-time)
#   CORS_ORIGIN            -> origem(ns) do web liberada(s) na API
#
set -euo pipefail

# Raiz do repositório (este script está em scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 0. Atualizar código (opcional). Ative com PULL=1 ./scripts/deploy.sh
# ---------------------------------------------------------------------------
if [[ "${PULL:-0}" == "1" ]]; then
  log "git pull"
  git pull --ff-only
fi

# ---------------------------------------------------------------------------
# 1. Dependências (inclui as novas: serve-static + multer)
# ---------------------------------------------------------------------------
log "Instalando dependências (pnpm install --frozen-lockfile)"
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 2. Build — contracts primeiro (api e web importam de @plataforma/contracts)
# ---------------------------------------------------------------------------
log "Build @plataforma/contracts"
pnpm --filter @plataforma/contracts build

log "Prisma generate"
pnpm --filter @plataforma/api prisma:generate

# ---------------------------------------------------------------------------
# 3. Migration nova (empresas.alias / empresas.logoUrl)
#    migrate deploy só aplica migrations pendentes; nunca apaga dados.
# ---------------------------------------------------------------------------
log "Aplicando migrations (prisma migrate deploy)"
pnpm --filter @plataforma/api exec prisma migrate deploy

# ---------------------------------------------------------------------------
# 4. Build da API e do Web
# ---------------------------------------------------------------------------
log "Build da API"
pnpm --filter @plataforma/api build

log "Build do Web"
pnpm --filter web build

# ---------------------------------------------------------------------------
# 5. Diretório de uploads (logos). Precisa persistir entre deploys.
#    Em disco local isto sobrevive a restart, mas NÃO a recriação do host/
#    container — em produção aponte para um volume/objeto persistente.
# ---------------------------------------------------------------------------
UPLOADS_DIR="$ROOT/apps/api/uploads/logos"
log "Garantindo diretório de uploads: $UPLOADS_DIR"
mkdir -p "$UPLOADS_DIR"

# ---------------------------------------------------------------------------
# 6. Restart dos serviços (best-effort, detecta o gerenciador disponível)
# ---------------------------------------------------------------------------
log "Reiniciando serviços"
if command -v pm2 >/dev/null 2>&1 && pm2 list >/dev/null 2>&1; then
  # Ajuste os nomes conforme seus processos pm2 (ex.: api, web).
  pm2 restart api web --update-env || pm2 restart all --update-env
  pm2 save || true
  echo "Serviços reiniciados via pm2."
elif [[ -f "$ROOT/docker/docker-compose.prod.yml" ]]; then
  docker compose -f docker/docker-compose.prod.yml up -d --build
  echo "Serviços reiniciados via docker compose (prod)."
else
  echo "!! Nenhum gerenciador de processo detectado (pm2/docker compose prod)."
  echo "!! Reinicie manualmente a API e o Web para carregar os novos builds."
fi

log "Deploy concluído."
