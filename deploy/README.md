# Deploy guide — Renovation Radar EU

Pakket voor Ubuntu 22.04, geschikt voor servers waar al andere applicaties
draaien. Het script raakt **niets** aan bestaande sites: eigen poort,
eigen systeem-user, eigen DB-user, eigen nginx vhost.

---

## Eenmalige installatie

Op de server (als root):

```bash
# 1. Repo clonen op de eindlocatie
git clone https://github.com/bverdijk1989/renovationradar.git /var/www/renovationradar
cd /var/www/renovationradar

# 2. Installer draaien
bash deploy/server-setup.sh
```

Wat het script doet:

| Stap | Actie |
| --- | --- |
| 1 | OS-check (Ubuntu 22.04) |
| 2 | Node ${NODE_MAJOR:-20} + pnpm (via corepack) — alleen als versie te oud / ontbreekt |
| 3 | Postgres + PostGIS — hergebruikt bestaande Postgres, anders installeert v16 via PGDG |
| 4 | Redis — hergebruikt bestaande, anders apt install |
| 5 | Nginx + certbot — hergebruikt bestaande |
| 6 | **Detecteert een vrije poort** (3017, 3018, …) |
| 7 | System-user `renovationradar` (geen shell, home = /var/www/renovationradar) |
| 8 | DB-user + database + PostGIS extensions; wachtwoord random gegenereerd |
| 9 | `.env` schrijven (mode 600, owned by app-user) met random `NEXTAUTH_SECRET` |
| 10 | `pnpm install` + `prisma migrate deploy` + `db:postgis` + `db:seed` + `pnpm build` |
| 11 | systemd unit installeren + enabled + started |
| 12 | nginx vhost in `/etc/nginx/sites-available/<domain>` + symlink + reload |
| 13 | Let's Encrypt via certbot (DNS moet kloppen) |

### Overrides via env

```bash
DOMAIN=other.example.com bash deploy/server-setup.sh
PORT=3030 bash deploy/server-setup.sh
SKIP_CERTBOT=1 bash deploy/server-setup.sh    # voor lokaal testen / IP-only
SKIP_SEED=1 bash deploy/server-setup.sh
```

---

## Voorwaarde: DNS

Voor de Let's Encrypt-stap moet `renovationradar.aegiscore.nl` al
verwijzen naar het IP van deze server. Check:

```bash
dig +short renovationradar.aegiscore.nl
# moet 195.201.149.219 teruggeven
```

Als DNS nog niet propagated is: gebruik `SKIP_CERTBOT=1` en draai certbot
later handmatig:

```bash
certbot --nginx -d renovationradar.aegiscore.nl
```

---

## Updates / redeploy

Na de eerste run is `deploy/deploy.sh` de happy-path voor elke release:

```bash
ssh root@195.201.149.219 -p 2222
bash /var/www/renovationradar/deploy/deploy.sh
```

Dat doet: `git pull` → `pnpm install` → `prisma migrate deploy` →
`pnpm db:postgis` → `pnpm build` → `systemctl restart renovationradar`.

Branch overschrijven:

```bash
BRANCH=feature/x bash /var/www/renovationradar/deploy/deploy.sh
```

Alleen migrations zonder build:

```bash
SKIP_BUILD=1 bash /var/www/renovationradar/deploy/deploy.sh
```

---

## Operationeel

| Wat | Commando |
| --- | --- |
| Status | `systemctl status renovationradar` |
| Logs (live) | `journalctl -u renovationradar -f` |
| Logs (recent) | `journalctl -u renovationradar -n 200 --no-pager` |
| Restart | `systemctl restart renovationradar` |
| Stop | `systemctl stop renovationradar` |
| Nginx logs | `tail -f /var/log/nginx/renovationradar.{access,error}.log` |
| DB shell | `sudo -u postgres psql renovationradar` |
| Prisma studio | als app-user: `cd /var/www/renovationradar && pnpm prisma studio` (lokale tunnel nodig) |

### Eerste admin-user aanmaken

De seed maakt geen admin tenzij `SEED_DEV_ADMIN_EMAIL` gezet is. Aanmaken:

```bash
sudo -u postgres psql renovationradar -c \
  "INSERT INTO users (id, email, role, created_at, updated_at)
   VALUES (gen_random_uuid(), 'bart@example.com', 'admin', NOW(), NOW())
   ON CONFLICT (email) DO UPDATE SET role='admin';"
```

Daarna `/login` openen en de admin-rij selecteren.

---

## Troubleshooting

### Service start niet

```bash
journalctl -u renovationradar -n 100 --no-pager
```

Veelvoorkomende oorzaken:
- `.env` mist een verplicht veld — check tegen `.env.example`.
- `DATABASE_URL` is onjuist — wachtwoord in `.deploy-db-password` matchet
  niet met de Postgres-user. Reset met:
  ```bash
  sudo -u postgres psql -c "ALTER USER renovationradar WITH PASSWORD 'nieuw';"
  ```
  en update `.env`.
- pnpm niet gevonden — `corepack enable && corepack prepare pnpm@9 --activate`.

### Nginx vhost geeft 502

App draait niet of op verkeerde poort. Check:

```bash
ss -tlnp | grep renovationradar    # niets? service draait niet
grep '__PORT__\|listen' /etc/nginx/sites-available/renovationradar.aegiscore.nl
```

### Certbot faalt

DNS staat nog niet, of poort 80 is dicht. Test:

```bash
curl -I http://renovationradar.aegiscore.nl
```

Als dat hangt: firewall (ufw) check, en eventueel `ufw allow 'Nginx Full'`.

### "Database does not exist" na verkeerde DB-naam

```bash
sudo -u postgres dropdb renovationradar    # voorzichtig — data weg
sudo -u postgres dropuser renovationradar
rm /var/www/renovationradar/.deploy-db-password
bash /var/www/renovationradar/deploy/server-setup.sh    # opnieuw
```

---

## Wat NIET in dit pakket zit

- **BullMQ workers** — fase 5+. Wanneer toegevoegd: extra systemd unit
  `renovationradar-worker.service` met `ExecStart=/usr/bin/pnpm worker`.
- **Meilisearch** — niet vereist tot fase 4 deel 7. Schema heeft al een
  client; configureer `MEILISEARCH_HOST` + `MEILISEARCH_MASTER_KEY` in
  `.env` zodra je een Meilisearch-instance hebt.
- **Backups** — niet geautomatiseerd. Aanrader: dagelijkse `pg_dump`
  + bestandsbackup van `/var/www/renovationradar/.env` naar een
  off-site locatie.
- **Monitoring** — geen Prometheus/uptime-monitor in dit pakket.
  Health endpoint draait op `https://renovationradar.aegiscore.nl/`.

---

## Bestanden in dit pakket

| Bestand | Rol |
| --- | --- |
| `server-setup.sh` | Eenmalige installer (idempotent — opnieuw runnen is veilig) |
| `deploy.sh` | Incremental redeploy (na de eerste run) |
| `renovationradar.service.template` | Systemd unit, placeholders `__PORT__`, `__APP_DIR__`, `__APP_USER__` |
| `nginx.conf.template` | Nginx vhost, placeholders `__DOMAIN__`, `__PORT__` |
| `.env.production.example` | Documentatie van alle env-variabelen |
| `README.md` | Dit bestand |
