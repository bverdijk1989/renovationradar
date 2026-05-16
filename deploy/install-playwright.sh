#!/usr/bin/env bash
# =============================================================================
# Renovation Radar EU — Playwright + Chromium installer.
# =============================================================================
#
# Opt-in: alleen draaien als je sources hebt die JS-rendering nodig hebben
# (Century21 BE, Immoweb, Funda, ...). Voor static-HTML sites is dit niet nodig.
#
# Run:
#   ssh root@<host>
#   bash /var/www/renovationradar/deploy/install-playwright.sh
#
# Wat het doet:
#   1. Installeert chromium-browser via apt + alle system libs die Chromium
#      nodig heeft (libnss3, libgbm1, libasound2, etc.)
#   2. Verifieert dat playwright-core in node_modules zit (komt vanzelf via
#      `pnpm install` als 'ie in package.json staat)
#   3. Test dat Chromium kan opstarten en een page kan laden
#
# Chromium-binary wordt NIET via Playwright's auto-download geïnstalleerd
# (die download zit niet in onze onlyBuiltDependencies allowlist) — we
# gebruiken de apt-versie en geven playwright-core het executablePath mee.
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/renovationradar}"
APP_USER="${APP_USER:-renovationradar}"

log()  { echo -e "\033[1;34m[playwright]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*" >&2; }
fail() { echo -e "\033[1;31m[fail]\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run als root."

# ---------- 1. Chromium + dependencies ---------------------------------------
log "Chromium + system libs installeren…"
apt-get update -qq
apt-get install -qq -y \
  chromium-browser \
  fonts-liberation \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0 \
  libwayland-client0 \
  || apt-get install -qq -y \
       chromium \
       fonts-liberation \
       libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
       libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
       libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
       libwayland-client0

# Find the actual chromium binary path — name varies between Ubuntu/Debian versions.
CHROMIUM_BIN=""
for candidate in \
  /usr/bin/chromium-browser \
  /usr/bin/chromium \
  /snap/bin/chromium \
  /usr/lib/chromium-browser/chromium-browser \
  /usr/lib/chromium/chromium; do
  if [[ -x "${candidate}" ]]; then
    CHROMIUM_BIN="${candidate}"
    break
  fi
done

[[ -n "${CHROMIUM_BIN}" ]] || fail "Chromium binary niet gevonden na install."
ok "Chromium binary: ${CHROMIUM_BIN}"

# ---------- 2. Persist executable path in .env -------------------------------
log "CHROMIUM_PATH in .env zetten…"
if grep -q '^CHROMIUM_PATH=' "${APP_DIR}/.env"; then
  sed -i "s|^CHROMIUM_PATH=.*|CHROMIUM_PATH=${CHROMIUM_BIN}|" "${APP_DIR}/.env"
else
  echo "CHROMIUM_PATH=${CHROMIUM_BIN}" >> "${APP_DIR}/.env"
fi
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok "CHROMIUM_PATH gezet."

# ---------- 3. Smoke test ----------------------------------------------------
log "Smoke test: Chromium opstarten via playwright-core…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && cat <<'JS' | node --input-type=module
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '${CHROMIUM_BIN}',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto('https://example.com', { timeout: 15000 });
const title = await page.title();
console.log('Smoke test OK — title=' + title);
await browser.close();
JS
" || fail "Chromium kon niet opstarten — check 'journalctl' en system libs."

ok "Playwright + Chromium klaar voor gebruik."
echo
log "Service herstarten zodat 'ie CHROMIUM_PATH oppikt:"
echo "  systemctl restart renovationradar"
