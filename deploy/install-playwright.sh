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
#   1. Installeert de system libs die Chromium nodig heeft (libnss3,
#      libgbm1, libasound2, etc.). Géén apt-chromium — op Ubuntu 24.04
#      is /usr/bin/chromium-browser een snap-wrapper die Playwright niet
#      kan launchen.
#   2. Downloadt Playwright's eigen Chromium-binary naar
#      ~/.cache/ms-playwright. Die werkt wel als child-process.
#   3. Vindt het pad, schrijft CHROMIUM_PATH naar .env.
#   4. Smoke-test: launch Chromium + fetch example.com.
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/renovationradar}"
APP_USER="${APP_USER:-renovationradar}"

log()  { echo -e "\033[1;34m[playwright]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*" >&2; }
fail() { echo -e "\033[1;31m[fail]\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run als root."

# ---------- 1. System libs (geen apt-chromium = snap wrapper) ---------------
log "Chromium system libs installeren…"
apt-get update -qq
apt-get install -qq -y \
  fonts-liberation \
  libnss3 libnspr4 libcups2t64 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0t64 \
  libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libwayland-client0 libx11-xcb1 libxkbcommon0 \
  || fail "apt install van system libs faalde."
ok "System libs ok."

# ---------- 2. Playwright's eigen Chromium downloaden -----------------------
# `pnpm dlx playwright install chromium` downloadt naar
# ~/.cache/ms-playwright/chromium-XXXX/chrome-linux/chrome. Werkt wél
# als child-process (geen snap-confinement).
log "Playwright Chromium-binary downloaden via pnpm dlx playwright (~200MB)…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && pnpm dlx playwright@1.49.1 install chromium" \
  || fail "Playwright chromium download faalde."

# ---------- 3. Binary-pad vinden + persisten in .env ------------------------
CHROMIUM_PATH=$(sudo -u "${APP_USER}" -- bash -lc \
  "find /home/${APP_USER}/.cache/ms-playwright -name 'chrome' -type f 2>/dev/null | head -1")

[[ -n "${CHROMIUM_PATH}" && -x "${CHROMIUM_PATH}" ]] || \
  fail "Chromium binary niet gevonden in ~/.cache/ms-playwright."
ok "Chromium binary: ${CHROMIUM_PATH}"

log "CHROMIUM_PATH in .env zetten…"
if grep -q '^CHROMIUM_PATH=' "${APP_DIR}/.env"; then
  sed -i "s|^CHROMIUM_PATH=.*|CHROMIUM_PATH=${CHROMIUM_PATH}|" "${APP_DIR}/.env"
else
  echo "CHROMIUM_PATH=${CHROMIUM_PATH}" >> "${APP_DIR}/.env"
fi
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok "CHROMIUM_PATH gezet."

# ---------- 4. Smoke test ----------------------------------------------------
log "Smoke test: Chromium opstarten + example.com fetchen…"
sudo -u "${APP_USER}" -- bash -lc "cd ${APP_DIR} && CHROMIUM_PATH='${CHROMIUM_PATH}' node --input-type=module" <<'JS' \
  || fail "Smoke test faalde — Chromium kon niet opstarten."
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.goto("https://example.com", { timeout: 15000, waitUntil: "domcontentloaded" });
const title = await page.title();
console.log("Smoke test OK — title=" + title);
await browser.close();
JS

ok "Playwright + Chromium klaar voor gebruik."
echo
log "Service herstarten zodat 'ie CHROMIUM_PATH oppikt:"
echo "  systemctl restart renovationradar"
