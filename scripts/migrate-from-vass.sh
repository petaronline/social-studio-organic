#!/usr/bin/env bash
#
# migrate-from-vass.sh — copy the organic half of a live Vass install into a
# fresh Vass Organic install.
#
# RUN AS ROOT ON THE SERVER, after Vass Organic is installed and its
# migrations (001-042) have run. Both compose stacks must be up.
#
#   /opt/vass-organic/scripts/migrate-from-vass.sh
#
# What it does:
#   1. pg_dump --data-only of the organic tables out of the Vass database
#   2. restores them into the Vass Organic database, in FK-safe order
#   3. rsyncs the uploads volume across
#
# Idempotency: it restores inside a single transaction and ABORTS on any
# conflict, so a second run against an already-populated database fails
# loudly rather than half-writing. To re-run, drop and re-create the target
# database first (see RESET below).
#
# What is deliberately NOT copied:
#   sessions      — everyone signs in fresh (the cookie name changed anyway)
#   oauth_states  — short-lived, worthless after the move
#   notifications — mostly ad-launch events that mean nothing here
#   audit_log     — stays with the ads app as the historical record
#   the 10 ads tables — dropped by migration 042
#
set -euo pipefail

SRC_STACK="/opt/vass"
DST_STACK="/opt/vass-organic"

SRC_DB_USER="vass"
SRC_DB_NAME="vass"
DST_DB_USER="vassorganic"
DST_DB_NAME="vassorganic"

SRC_PG="vass-postgres"
DST_PG="vass-organic-postgres"
SRC_BACKEND="vass-backend"
DST_BACKEND="vass-organic-backend"

STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="/root/vass-organic-migration-${STAMP}.sql"

# FK-safe order. Parents before children.
TABLES=(
  users
  app_settings
  brands
  brand_hashtags
  uploads
  user_meta_connections
  organic_connected_accounts
  meta_sync_state
  synced_meta_posts
  organic_idea_folders
  organic_ideas
  organic_posts
  organic_post_targets
  organic_post_media
  organic_post_insights
)

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root (needs docker access to both stacks)"

say "Checking both stacks are up…"
docker ps --format '{{.Names}}' | grep -qx "$SRC_PG"     || die "$SRC_PG not running"
docker ps --format '{{.Names}}' | grep -qx "$DST_PG"     || die "$DST_PG not running"
docker ps --format '{{.Names}}' | grep -qx "$DST_BACKEND" || die "$DST_BACKEND not running"
echo "    both stacks up"

say "Verifying the target schema is migrated and empty…"
# 042 must have run: ad_accounts should NOT exist in the target.
if docker exec -i "$DST_PG" psql -U "$DST_DB_USER" -d "$DST_DB_NAME" -tAc \
     "SELECT to_regclass('public.ad_accounts')" | grep -q .; then
  die "target still has ad_accounts — run 'docker compose exec backend npm run migrate' in $DST_STACK first"
fi
EXISTING=$(docker exec -i "$DST_PG" psql -U "$DST_DB_USER" -d "$DST_DB_NAME" -tAc \
  "SELECT count(*) FROM users")
if [[ "$EXISTING" != "0" ]]; then
  die "target already has $EXISTING user(s). Refusing to merge into a non-empty database.
       To start over:
         cd $DST_STACK && docker compose down
         docker volume rm vass-organic_organic_postgres_data
         docker compose up -d && docker compose exec backend npm run migrate"
fi
echo "    target schema migrated, no users yet"

say "Clearing migration-seeded defaults from the target…"
# The users check above proves this is a fresh install, but "fresh" is not the
# same as "every table empty": the migrations seed rows of their own — notably
# app_settings, which arrives pre-populated with defaults like
# meta.business_id. Restoring the source's app_settings on top of that
# collides on the primary key and aborts the whole transaction.
#
# So clear exactly the tables we are about to repopulate. CASCADE also clears
# anything referencing them (sessions, notifications, audit_log), all of which
# are empty on a fresh install and are deliberately not migrated anyway.
TRUNCATE_LIST=$(IFS=,; echo "${TABLES[*]}")
docker exec -i "$DST_PG" psql -U "$DST_DB_USER" -d "$DST_DB_NAME" \
  --set ON_ERROR_STOP=1 -q \
  -c "TRUNCATE TABLE ${TRUNCATE_LIST} RESTART IDENTITY CASCADE;"
echo "    cleared ${#TABLES[@]} tables"

say "Dumping organic data from $SRC_DB_NAME…"
TABLE_ARGS=()
for t in "${TABLES[@]}"; do TABLE_ARGS+=(--table="public.$t"); done
docker exec -i "$SRC_PG" pg_dump -U "$SRC_DB_USER" -d "$SRC_DB_NAME" \
  --data-only --no-owner --no-privileges --disable-triggers \
  "${TABLE_ARGS[@]}" > "$DUMP"
echo "    $(du -h "$DUMP" | cut -f1) → $DUMP"

say "Restoring into $DST_DB_NAME (single transaction, aborts on any error)…"
docker exec -i "$DST_PG" psql -U "$DST_DB_USER" -d "$DST_DB_NAME" \
  --single-transaction --set ON_ERROR_STOP=1 < "$DUMP"
echo "    restored"

say "Copying uploaded media…"
# Both volumes are mounted at /uploads inside their backend containers.
TMP="/root/vass-uploads-${STAMP}"
mkdir -p "$TMP"
docker cp "$SRC_BACKEND:/uploads/." "$TMP/"
docker cp "$TMP/." "$DST_BACKEND:/uploads/"
rm -rf "$TMP"
echo "    media copied"

say "Verifying…"
for t in users brands organic_connected_accounts organic_posts organic_post_targets uploads; do
  SRC_N=$(docker exec -i "$SRC_PG" psql -U "$SRC_DB_USER" -d "$SRC_DB_NAME" -tAc "SELECT count(*) FROM $t")
  DST_N=$(docker exec -i "$DST_PG" psql -U "$DST_DB_USER" -d "$DST_DB_NAME" -tAc "SELECT count(*) FROM $t")
  printf '    %-30s source=%-8s target=%-8s' "$t" "$SRC_N" "$DST_N"
  [[ "$SRC_N" == "$DST_N" ]] && printf '\033[1;32mOK\033[0m\n' || printf '\033[1;31mMISMATCH\033[0m\n'
done

cat <<EOF

Done. Dump kept at $DUMP — delete it once you have verified the app.

Next:
  1. Sign in at https://organic.petaronline.us with your existing credentials
     (password hashes came across; the session did not).
  2. Settings -> Connections: confirm the Meta App ID/Secret came across.
     They live in app_settings, so they should already be there.
  3. Open Analytics and confirm posts and insights render.
  4. Only then remove /organic from the ads app.

EOF
