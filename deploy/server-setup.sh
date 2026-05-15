#!/usr/bin/env bash
# =============================================================================
# Renovation Radar EU — first-run installer voor Ubuntu 22.04
# =============================================================================
#
# Veilig naast bestaande applicaties: detecteert wat al draait, installeert
# alleen wat ontbreekt, gebruikt een vrije poort en eigen DB-user, schrijft
# een nginx vhost in /etc/nginx/sites-available/ zonder bestaande sites te
# raken.
#
# Run als root:
#   ssh root@<host> -p <port>
#   cd /var/www/renovationradar       # repo moet hier al staan (git clone)
#   bash deploy/server-setup.sh
#
# Optioneel:
#   DOMAIN=other.example.com bash deploy/server-setup.sh
#   PORT=3017 bash deploy/server-setup.sh
#   SKIP_CERTBOT=1 bash deploy/server-setup.sh
#   SKIP_SEED=1 bash deploy/server-setup.sh
# =============================================================================

set -euo pipefail

# ---------- Settings (overridable via env) -----------------------------------
DOMAIN="${DOMAIN:-renovationradar.aegiscore.nl}"
APP_DIR="${APP_DIR:-/var/www/renovationradar}"
APP_USER="${APP_USER:-renovationradar}"
DB_NAME="${DB_NAME:-renovationradar}"
DB_USER="${DB_USER:-renovationradar}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
SKIP_SEED="${SKIP_SEED:-0}"
PORT="${PORT:-}"

# ---------- Pretty logging ---------------------------------------------------
log()  { echo -e "\033[1;34m[setup]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*" >&2; }
fail() { echo -e "\033[1;31m[fail]\033[0m $*" >&2; exit 1; }

# ---------- Preconditions ----------------------------------------------------
[[ $EUID -eq 0 ]] || fail "Run als root (gebruik 'bash' niet 'sudo bash' als je al root bent)."
[[ -f /etc/os-release ]] || fail "Geen /etc/os-release — onbekende distro."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || fail "Dit script is voor Ubuntu (jij draait '${ID:-?}')."
[[ "${VERSION_ID:-}" == "22.04" ]] || warn "Niet getest op Ubuntu ${VERSION_ID}; doorgaan op eigen risico."
[[ -f "${APP_DIR}/package.json" ]] || fail "Geen package.json in ${APP_DIR}. Eerst clonen: git clone https://github.com/bverdijk1989/renovationradar.git ${APP_DIR}"

export DEBIAN_FRONTEND=noninteractive

# ---------- 1. APT base ------------------------------------------------------
log "Base packages updaten…"
apt-get update -qq
apt-get install -qq -y curl ca-certificates gnupg lsb-release ufw openssl

# ---------- 2. Node + pnpm ---------------------------------------------------
ensure_node() {
  local current=""
  if command -v node >/dev/null; then
    current="$(node -v 2>/dev/null | sed 's/^v//;s/\..*//')"
  fi
  if [[ "${current}" -ge ${NODE_MAJOR} ]] 2>/dev/null; then
    ok "Node $(node -v) gevonden — laat staan."
    return
  fi
  log "Node ${NODE_MAJOR} installeren via NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -qq -y nodejs
  ok "Node $(node -v) geïnstalleerd."
}
ensure_node

if ! command -v pnpm >/dev/null; then
  log "pnpm activeren via corepack…"
  corepack enable
fi
# Forceer de pin uit package.json#packageManager — pnpm v10+ heeft
# onlyBuiltDependencies semantisch gewijzigd; we pinnen op 9.15.x zodat
# onze pnpm-workspace.yaml allowlist consistent werkt. `corepack prepare`
# zelf is idempotent: re-runs zijn no-ops als de versie al klopt.
PNPM_PIN="$(grep -oP '"packageManager"\s*:\s*"pnpm@\K[0-9.]+' "${APP_DIR}/package.json" 2>/dev/null || echo "9.15.4")"
log "pnpm pinnen op v${PNPM_PIN} via corepack (override eventuele v10/v11)…"
corepack prepare "pnpm@${PNPM_PIN}" --activate
ok "pnpm $(pnpm --version 2>&1 | tail -1) actief."

# ---------- 3. Postgres + PostGIS -------------------------------------------
PG_BIN=""
PG_MAJOR=""
ensure_postgres() {
  if command -v psql >/dev/null && systemctl is-active --quiet postgresql; then
    PG_MAJOR="$(sudo -u postgres psql -tAc 'SHOW server_version_num;' | head -c2)"
    ok "Bestaande Postgres ${PG_MAJOR} gedetecteerd — hergebruik."
    return
  fi
  log "Postgres 16 installeren via PGDG…"
  install -d /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/pgdg.gpg
  echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -qq -y postgresql-16 postgresql-16-postgis-3
  systemctl enable --now postgresql
  PG_MAJOR=16
  ok "Postgres 16 + PostGIS 3 geïnstalleerd."
}
ensure_postgres

# Installeer PostGIS-package matching de gevonden major, mocht hij er nog niet zijn.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_available_extensions WHERE name='postgis';" 2>/dev/null | grep -q 1; then
  log "PostGIS-extension package installeren voor Postgres ${PG_MAJOR}…"
  apt-get install -qq -y "postgresql-${PG_MAJOR}-postgis-3" || warn "Kon PostGIS niet installeren — DB-stap kan falen."
fi

# ---------- 4. Redis ---------------------------------------------------------
if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
  ok "Redis al actief — hergebruik."
else
  log "Redis installeren…"
  apt-get install -qq -y redis-server
  systemctl enable --now redis-server
  ok "Redis actief."
fi

# ---------- 5. Nginx + certbot ----------------------------------------------
if ! command -v nginx >/dev/null; then
  log "Nginx installeren…"
  apt-get install -qq -y nginx
  systemctl enable --now nginx
  ok "Nginx actief."
else
  ok "Nginx al aanwezig — bestaande config blijft staan."
fi
if [[ "${SKIP_CERTBOT}" != "1" ]] && ! command -v certbot >/dev/null; then
  log "Certbot installeren…"
  apt-get install -qq -y certbot python3-certbot-nginx
fi

# ---------- 6. Pick free port ------------------------------------------------
pick_port() {
  if [[ -n "${PORT}" ]]; then
    if ss -tln | grep -qE ":${PORT}\b"; then
      fail "Poort ${PORT} is al in gebruik."
    fi
    return
  fi
  for p in 3017 3018 3019 3020 3021 3027 4321 4327; do
    if ! ss -tln | grep -qE ":${p}\b"; then
      PORT="$p"; return
    fi
  done
  fail "Geen vrije poort gevonden in 3017-3021, 3027, 4321, 4327."
}
pick_port
ok "App draait straks op poort ${PORT}."

# ---------- 7. System user ---------------------------------------------------
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  log "System-user '${APP_USER}' aanmaken…"
  useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  ok "User '${APP_USER}' aangemaakt."
fi
# Belangrijk: als ${APP_DIR} een symlink is (bv. /var/www/renovationradar →
# /mnt/HC_Volume_.../renovationradar) dan dereferencen we hem hier expliciet,
# anders raakt 'chown -R' alleen de symlink-inode zelf en niet de target.
APP_DIR_REAL="$(readlink -f "${APP_DIR}" 2>/dev/null || echo "${APP_DIR}")"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR_REAL}"

# ---------- 8. DB user + database --------------------------------------------
DB_PASSWORD_FILE="${APP_DIR}/.deploy-db-password"
if [[ -f "${DB_PASSWORD_FILE}" ]]; then
  DB_PASSWORD="$(cat "${DB_PASSWORD_FILE}")"
  ok "Bestaande DB-credentials gevonden — hergebruik."
else
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 30)"
  echo -n "${DB_PASSWORD}" > "${DB_PASSWORD_FILE}"
  chmod 600 "${DB_PASSWORD_FILE}"
  chown "${APP_USER}:${APP_USER}" "${DB_PASSWORD_FILE}"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}';" | grep -q 1; then
  log "DB-user '${DB_USER}' aanmaken…"
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" | grep -q 1; then
  log "Database '${DB_NAME}' aanmaken…"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
fi
# Zorg dat PostGIS aanwezig is op deze DB (idempotent).
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS citext;" >/dev/null
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
ok "Database '${DB_NAME}' klaar met PostGIS-extensies."

# ---------- 9. .env genereren ------------------------------------------------
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  log ".env genereren…"
  NEXTAUTH_SECRET="$(openssl rand -base64 32)"
  cat > "${ENV_FILE}" <<EOF
# Auto-generated by deploy/server-setup.sh — bewerk handmatig waar nodig.
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="https://${DOMAIN}"
REDIS_URL="redis://localhost:6379"
MEILISEARCH_HOST="http://localhost:7700"
MEILISEARCH_MASTER_KEY="not-yet-configured"
ORIGIN_LAT="51.3704"
ORIGIN_LNG="6.1724"
ORIGIN_LABEL="Venlo"
MAX_DISTANCE_KM="350"
MAX_PRICE_EUR="200000"
MIN_LAND_M2="10000"
PORT="${PORT}"
NODE_ENV="production"
EOF
  chmod 600 "${ENV_FILE}"
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  ok ".env aangemaakt (mode 600)."
else
  ok "Bestaande .env behouden — niets overschreven."
fi

# ---------- 10. App bouwen ---------------------------------------------------
log "pnpm install (production deps + dev voor build)…"
# pnpm v9+ verwerpt postinstall scripts default — pnpm-workspace.yaml's
# onlyBuiltDependencies lijst whitelist'd ze. Mocht pnpm alsnog non-zero
# exiten met een ignored-builds waarschuwing, gaan we door naar de
# rebuild stap die de buildscripts expliciet draait.
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm install --no-frozen-lockfile" \
  || warn "pnpm install gaf non-zero exit — vaak alleen een ignored-builds waarschuwing. rebuild volgt."

log "pnpm rebuild voor packages met native binaries (Prisma engines, esbuild)…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm rebuild @prisma/client @prisma/engines prisma esbuild" \
  || warn "pnpm rebuild faalde — Prisma generate hieronder doet vaak zijn eigen engine download."

log "Prisma generate + migrate deploy…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm prisma generate && pnpm prisma migrate deploy"
log "PostGIS triggers + indexes toepassen…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm db:postgis"

if [[ "${SKIP_SEED}" != "1" ]]; then
  log "Seed data (12 search profiles + 8 sources + 11 listings)…"
  sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm db:seed" || warn "Seed faalde — handmatig draaien als gewenst."
fi

log "Next.js production build…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm build"
ok "Build voltooid."

# ---------- 11. systemd unit -------------------------------------------------
log "Systemd unit installeren…"
sed -e "s|__PORT__|${PORT}|g" \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_USER__|${APP_USER}|g" \
    "${APP_DIR}/deploy/renovationradar.service.template" \
    > /etc/systemd/system/renovationradar.service
systemctl daemon-reload
systemctl enable --now renovationradar
sleep 2
if systemctl is-active --quiet renovationradar; then
  ok "renovationradar.service draait op poort ${PORT}."
else
  warn "renovationradar.service start niet — check 'journalctl -u renovationradar -n 50'"
fi

# ---------- 12. Nginx vhost --------------------------------------------------
log "Nginx vhost voor ${DOMAIN}…"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
sed -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__PORT__|${PORT}|g" \
    "${APP_DIR}/deploy/nginx.conf.template" \
    > "${NGINX_AVAILABLE}"
ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
if nginx -t 2>&1 | grep -q "syntax is ok"; then
  systemctl reload nginx
  ok "Nginx vhost actief (HTTP)."
else
  warn "nginx -t faalt — vhost NIET geactiveerd. Run 'nginx -t' om te debuggen."
fi

# ---------- 13. Let's Encrypt -----------------------------------------------
if [[ "${SKIP_CERTBOT}" != "1" ]]; then
  log "Let's Encrypt aanvragen voor ${DOMAIN}…"
  if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
       --email "admin@$(echo "${DOMAIN}" | sed 's/^[^.]*\.//')" --redirect 2>&1; then
    ok "HTTPS actief op https://${DOMAIN}"
  else
    warn "Certbot faalde. Mogelijk werkt DNS nog niet of staat poort 80 dicht."
    warn "Probeer later: certbot --nginx -d ${DOMAIN}"
  fi
fi

# ---------- 14. Summary ------------------------------------------------------
echo
ok "Klaar! Status:"
echo "  Domein  : https://${DOMAIN}"
echo "  Poort   : ${PORT} (intern)"
echo "  App-user: ${APP_USER}"
echo "  DB      : postgresql://${DB_USER}@localhost/${DB_NAME}"
echo "  Service : systemctl status renovationradar"
echo "  Logs    : journalctl -u renovationradar -f"
echo "  Redeploy: bash ${APP_DIR}/deploy/deploy.sh"
echo
echo "Volgende stap: log in op https://${DOMAIN}/login en kies een dev-user."
echo "(De seed maakte geen admin aan — zie SEED_DEV_ADMIN_EMAIL in .env als je dat wilt.)"
