#!/usr/bin/env bash
# =============================================================================
# Renovation Radar EU — install/refresh de hourly crawler-cron.
# =============================================================================
#
# Eenmalig draaien (of opnieuw als je iets aan de templates wijzigt):
#   ssh root@<host>
#   bash /var/www/renovationradar/deploy/install-cron.sh
#
# Wat het doet:
#   1. Genereert CRON_TOKEN (32 hex chars) en zet 'm in .env als nog niet aanwezig.
#   2. Installeert renovationradar-crawl.service + .timer in /etc/systemd/system.
#   3. Enabled + start de timer.
#   4. Toont de status zodat je weet dat 'ie loopt.
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/renovationradar}"
APP_USER="${APP_USER:-renovationradar}"
PORT="${PORT:-3017}"

log()  { echo -e "\033[1;34m[cron]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
fail() { echo -e "\033[1;31m[fail]\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run als root."
[[ -f "${APP_DIR}/.env" ]] || fail "${APP_DIR}/.env ontbreekt — eerst server-setup draaien."

# ---------- 1. CRON_TOKEN in .env --------------------------------------------
if grep -q '^CRON_TOKEN=' "${APP_DIR}/.env"; then
  ok "CRON_TOKEN al aanwezig in .env — hergebruik."
else
  TOKEN=$(openssl rand -hex 32)
  echo "CRON_TOKEN=${TOKEN}" >> "${APP_DIR}/.env"
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  ok "CRON_TOKEN gegenereerd en toegevoegd aan .env."
fi

# ---------- 2. Service + timer installeren -----------------------------------
log "Systemd unit + timer installeren…"
sed -e "s|__PORT__|${PORT}|g" \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_USER__|${APP_USER}|g" \
    "${APP_DIR}/deploy/renovationradar-crawl.service.template" \
    > /etc/systemd/system/renovationradar-crawl.service

cp "${APP_DIR}/deploy/renovationradar-crawl.timer" \
   /etc/systemd/system/renovationradar-crawl.timer

# ---------- 3. Main service moet de nieuwe CRON_TOKEN env-var oppikken -------
# De Next.js service heeft EnvironmentFile=.env — die wordt pas opnieuw gelezen
# bij restart. Anders geeft /api/jobs/run-all 403 ("CRON_TOKEN not configured").
log "renovationradar.service herstarten zodat 'ie de nieuwe CRON_TOKEN ziet…"
systemctl restart renovationradar
sleep 2
systemctl is-active --quiet renovationradar || fail "renovationradar.service start niet."

# ---------- 4. Timer enablen --------------------------------------------------
systemctl daemon-reload
systemctl enable --now renovationradar-crawl.timer

ok "Crawler-timer actief."
echo
systemctl list-timers renovationradar-crawl.timer --no-pager || true
echo
log "Eerste run is over 5 min. Handmatig testen:"
echo "  systemctl start renovationradar-crawl.service"
echo "  journalctl -u renovationradar-crawl.service -n 50 --no-pager"
