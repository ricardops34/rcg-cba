#!/usr/bin/env bash
#
# Aplica os ajustes de banco (migrations do Prisma) no Postgres alvo.
# Inclui a migration nova: empresas.alias / empresas.logoUrl.
#
# É seguro rodar várias vezes: "prisma migrate deploy" só aplica migrations
# PENDENTES, registra cada uma em _prisma_migrations e NUNCA apaga dados.
# Não gera migrations novas nem faz reset — é o comando próprio para produção.
#
# Uso na VPS (a partir da raiz do repositório):
#   chmod +x scripts/db-migrate.sh
#   ./scripts/db-migrate.sh
#
# Banco alvo: por padrão usa a DATABASE_URL de apps/api/.env. Para apontar para
# outro banco (ex.: produção), exporte antes de chamar:
#   DATABASE_URL="postgresql://user:senha@host:5432/db?schema=public" ./scripts/db-migrate.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/api"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# Se DATABASE_URL não veio do ambiente, o Prisma carrega de apps/api/.env.
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Usando DATABASE_URL do ambiente."
else
  echo "Usando DATABASE_URL de apps/api/.env."
fi

log "Migrations pendentes (antes)"
pnpm exec prisma migrate status || true

log "Aplicando migrations (prisma migrate deploy)"
pnpm exec prisma migrate deploy

log "Estado final"
pnpm exec prisma migrate status

log "Banco atualizado."
