#!/usr/bin/env bash
# =============================================================================
# Renovation Radar EU — incremental redeploy
# =============================================================================
#
# Pulls latest main, installs deps, runs pending migrations, applies PostGIS
# setup (idempotent), rebuilds Next.js, restarts the systemd service.
#
# Voor de first-run: gebruik deploy/server-setup.sh.
#
# Run:
#   ssh root@<host>
#   bash /var/www/renovationradar/deploy/deploy.sh
#
# Optioneel:
#   BRANCH=feature/x bash deploy/deploy.sh
#   SKIP_BUILD=1 bash deploy/deploy.sh        # alleen migrations/seed
#   SKIP_MIGRATE=1 bash deploy/deploy.sh      # alleen build
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/renovationradar}"
APP_USER="${APP_USER:-renovationradar}"
BRANCH="${BRANCH:-main}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

log()  { echo -e "\033[1;34m[deploy]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok  ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn ]\033[0m $*" >&2; }
fail() { echo -e "\033[1;31m[fail ]\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run als root."
[[ -d "${APP_DIR}/.git" ]] || fail "Geen git repo in ${APP_DIR}. Eerst server-setup draaien."

cd "${APP_DIR}"

log "Git pull origin/${BRANCH}…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && git fetch origin && git reset --hard origin/${BRANCH}"

log "pnpm install…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm install --no-frozen-lockfile" \
  || warn "pnpm install gaf non-zero exit — vaak alleen ignored-builds, rebuild volgt."

sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm rebuild @prisma/client @prisma/engines prisma esbuild" \
  || warn "pnpm rebuild faalde — generate hieronder doet vaak zijn eigen download."

sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm prisma generate"

if [[ "${SKIP_MIGRATE}" != "1" ]]; then
  log "Prisma db push (schema → DB)…"
  # 'db push' i.p.v. 'migrate deploy' totdat we migration-files in de repo
  # hebben. Idempotent: doet niks als schema al klopt.
  sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm prisma db push --skip-generate"
  log "PostGIS triggers + indexes (idempotent)…"
  sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm db:postgis"
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "Next.js build…"
  sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm build"
fi

log "Restart renovationradar.service…"
systemctl restart renovationradar
sleep 2
if systemctl is-active --quiet renovationradar; then
  ok "Service draait — versie: $(git -C ${APP_DIR} rev-parse --short HEAD)"
else
  fail "Service start niet — check 'journalctl -u renovationradar -n 50'"
fi
