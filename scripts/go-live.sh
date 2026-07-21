#!/usr/bin/env bash
#
# go-live.sh — the entire server-side setup of Vass Organic, in one run.
#
# Everything that could be done without root has already been done:
#   • DNS: organic.petaronline.us -> 95.216.96.53 (created via cPanel API)
#   • the code is already staged on this box
#   • the ads app has already been updated so Comment Guard no longer needs
#     the organic tables
#
# What is left needs root, which is why this script exists. Run it as root:
#
#     bash /home/petaronline/public_html/vass-organic/repo/scripts/go-live.sh
#
# It will:
#   1. Back up the ads database (safety net, before anything else)
#   2. Copy the repo into /opt/vass-organic
#   3. Install the Apache vhost so the subdomain proxies to the app
#   4. Build and start the stack, run migrations 001-042
#   5. Copy the organic data + uploads across from the ads install
#   6. Verify end to end and print what to check
#
# SAFE TO RE-RUN: every step is guarded. It never writes to the ads database
# or the ads containers — it only reads from them.
#
# TO ABORT AT ANY POINT: nothing the ads app depends on has been touched.
#   cd /opt/vass-organic && docker compose down -v
#   rm -f /etc/apache2/conf.d/userdata/ssl/2_4/petaronline/organic.petaronline.us/vass-organic.conf
#   /scripts/rebuildhttpdconf && systemctl restart httpd
#
set -euo pipefail

REPO_SRC="/home/petaronline/public_html/vass-organic/repo"
INSTALL_ROOT="/opt/vass-organic"
DOMAIN="organic.petaronline.us"
FRONTEND_PORT="3031"
BACKEND_PORT="4041"

SRC_PG="vass-postgres"
SRC_DB_USER="vass"
SRC_DB_NAME="vass"

STAMP="$(date +%Y%m%d-%H%M%S)"

c_blue()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
c_green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_red()   { printf '\033[1;31m%s\033[0m\n' "$*"; }
step()    { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()     { c_red "ERROR: $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root"
[[ -d "$REPO_SRC" ]] || die "repo not found at $REPO_SRC"

# ============================================================================
step "[1/6] Backing up the ads database first"
# ============================================================================
BACKUP="/root/vass-pre-organic-split-${STAMP}.sql.gz"
if docker ps --format '{{.Names}}' | grep -qx "$SRC_PG"; then
  docker exec -i "$SRC_PG" pg_dump -U "$SRC_DB_USER" -d "$SRC_DB_NAME" | gzip > "$BACKUP"
  c_green "  ✓ $(du -h "$BACKUP" | cut -f1) → $BACKUP"
else
  die "$SRC_PG is not running — is the ads app up?"
fi

# ============================================================================
step "[2/6] Installing the code into $INSTALL_ROOT"
# ============================================================================
mkdir -p "$INSTALL_ROOT"
# Preserve an existing .env across re-runs — it holds SESSION_SECRET, which
# is the AES key for every stored token. Regenerating it is unrecoverable.
if [[ -f "$INSTALL_ROOT/.env" ]]; then
  cp "$INSTALL_ROOT/.env" "/root/vass-organic-env-backup-${STAMP}"
  c_blue "  existing .env preserved (copy at /root/vass-organic-env-backup-${STAMP})"
fi
rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git \
      --exclude .env "$REPO_SRC/" "$INSTALL_ROOT/"
cp "$REPO_SRC/scripts/install-patch.sh" "$INSTALL_ROOT/install-patch.sh"
chmod +x "$INSTALL_ROOT"/*.sh "$INSTALL_ROOT"/scripts/*.sh
c_green "  ✓ code in place"

# ============================================================================
step "[3/6] Installing the Apache vhost for $DOMAIN"
# ============================================================================
# cPanel owns the generated vhost, so we add an include rather than editing it.
# Both the SSL and non-SSL userdata dirs get the same proxy rules.
for VARIANT in "std/2_4" "ssl/2_4"; do
  UD="/etc/apache2/conf.d/userdata/${VARIANT}/petaronline/${DOMAIN}"
  mkdir -p "$UD"
  cat > "${UD}/vass-organic.conf" <<CONF
# Vass Organic reverse proxy — managed by go-live.sh, safe to regenerate.
# /api/* -> backend (prefix stripped by the trailing slash), everything else
# -> the Next.js frontend. Host-side ports from docker-compose.yml.
ProxyPreserveHost On
ProxyRequests Off
ProxyTimeout 300

ProxyPass        /api/ http://127.0.0.1:${BACKEND_PORT}/
ProxyPassReverse /api/ http://127.0.0.1:${BACKEND_PORT}/

ProxyPass        / http://127.0.0.1:${FRONTEND_PORT}/
ProxyPassReverse / http://127.0.0.1:${FRONTEND_PORT}/

RequestHeader set X-Forwarded-Proto "https"

RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/?(.*) "ws://127.0.0.1:${FRONTEND_PORT}/\$1" [P,L]
CONF
done
/scripts/ensure_vhost_includes --user=petaronline >/dev/null 2>&1 || true
/scripts/rebuildhttpdconf >/dev/null
if apachectl configtest 2>&1 | grep -qi "syntax ok"; then
  systemctl restart httpd
  c_green "  ✓ vhost installed, Apache restarted"
else
  c_red "  Apache config test FAILED — rolling the include back"
  rm -f /etc/apache2/conf.d/userdata/*/2_4/petaronline/${DOMAIN}/vass-organic.conf
  /scripts/rebuildhttpdconf >/dev/null
  die "Apache would not accept the vhost; nothing else was changed"
fi

# ============================================================================
step "[4/6] Building and starting the stack"
# ============================================================================
cd "$INSTALL_ROOT"
if [[ -f .env ]]; then
  c_blue "  .env already exists — reusing it (SESSION_SECRET preserved)"
  docker compose up -d --build
  for i in $(seq 1 60); do
    docker compose exec -T backend echo ok >/dev/null 2>&1 && break
    sleep 1
  done
  docker compose exec -T backend npm run migrate
else
  # Unattended: URL from the env, no admin prompt — the data migration in
  # step 5 brings the real users across.
  FRONTEND_URL="https://${DOMAIN}" SKIP_ADMIN_USER=1 ./install.sh
fi
c_green "  ✓ stack up, migrations 001-042 applied"

# ============================================================================
step "[5/6] Copying organic data across from the ads install"
# ============================================================================
ALREADY=$(docker exec -i vass-organic-postgres \
  psql -U vassorganic -d vassorganic -tAc "SELECT count(*) FROM users" 2>/dev/null || echo 0)
if [[ "$ALREADY" != "0" ]]; then
  c_blue "  target already has $ALREADY user(s) — data was migrated on an"
  c_blue "  earlier run, skipping. (To redo it, see RESET in migrate-from-vass.sh.)"
else
  "$INSTALL_ROOT/scripts/migrate-from-vass.sh"
fi

# ============================================================================
step "[6/6] Verifying"
# ============================================================================
sleep 3
FAILED=0
check() {
  printf '    %-46s' "$1"
  if eval "$2" >/dev/null 2>&1; then c_green "OK"; else c_red "FAILED"; FAILED=1; fi
}
check "backend health (direct)"  "curl -sf http://127.0.0.1:${BACKEND_PORT}/health"
check "frontend (direct)"        "curl -sf http://127.0.0.1:${FRONTEND_PORT}/login"
check "https://${DOMAIN}/api/health" "curl -sf https://${DOMAIN}/api/health"
check "https://${DOMAIN}/login"      "curl -sf https://${DOMAIN}/login"
check "ads app still healthy"    "curl -sf https://vass.petaronline.us/api/health"

echo
if [[ $FAILED -eq 0 ]]; then
  c_green "════════════════════════════════════════════════════════════"
  c_green " Vass Organic is live at https://${DOMAIN}"
  c_green "════════════════════════════════════════════════════════════"
else
  c_red "════════════════════════════════════════════════════════════"
  c_red " Checks failed — diagnostics below. Send this whole block."
  c_red "════════════════════════════════════════════════════════════"
  cd "$INSTALL_ROOT"

  step "Container status"
  docker compose ps || true

  step "Host ports (ours 3031/4041, ads 3030/4040 for comparison)"
  ss -tlnp 2>/dev/null | grep -E "3031|4041|3030|4040|5433|6380" || echo "  (nothing listening)"

  step "Backend logs (last 60)"
  docker compose logs --tail=60 --no-color backend 2>&1 | tail -60 || true

  step "Frontend logs (last 40)"
  docker compose logs --tail=40 --no-color frontend 2>&1 | tail -40 || true

  step "Restart counts (a climbing number means a crash loop)"
  for c in vass-organic-backend vass-organic-frontend vass-organic-postgres vass-organic-redis; do
    printf '    %-32s restarts=%s running=%s\n' "$c" \
      "$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo '?')" \
      "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo '?')"
  done

  echo
  c_red "If only the two https checks failed but the direct ones passed,"
  c_red "it is just AutoSSL: WHM → Manage AutoSSL → Run for all users."
fi

cat <<EOF

Ads database backup: $BACKUP

Two things still need a browser:

  1. Meta App → Facebook Login → Settings → Valid OAuth Redirect URIs,
     ADD (keep the existing vass. ones):

         https://${DOMAIN}/api/organic/accounts/callback

  2. Sign in at https://${DOMAIN} with your existing Vass email and
     password, then check Settings → Social profiles lists your accounts
     and Analytics shows data.

Until step 1 is done, connecting a NEW social account will fail. Accounts
already connected keep working — their tokens came across intact.

EOF
