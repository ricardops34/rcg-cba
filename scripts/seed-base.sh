#!/usr/bin/env bash
#
# Popula a base mínima: 3 empresas (BJSoftware, RCG, CBA) + 1 Admin com acesso
# às 3. LIMPA os dados de negócio antes de popular. Idempotente.
#
# Uso (a partir da raiz do repositório):
#   chmod +x scripts/seed-base.sh
#   ./scripts/seed-base.sh
#
# Banco alvo: DATABASE_URL do ambiente ou de apps/api/.env. Para outro banco:
#   DATABASE_URL="postgresql://user:senha@host:5432/db?schema=public" ./scripts/seed-base.sh
#
# ATENÇÃO: apaga os dados de negócio do banco apontado por DATABASE_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/api"

pnpm exec ts-node prisma/seed-base.ts
