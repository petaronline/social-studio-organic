#!/usr/bin/env bash
#
# check-insights.sh — why analytics is empty, per connected profile.
#
# Run as root on the server:
#     bash /opt/vass-organic/scripts/check-insights.sh
#
# Post insights need a scope BEYOND the ones publishing needs, and each
# network names it differently:
#
#     Facebook Page   read_insights
#     Instagram       instagram_manage_insights
#     Threads         threads_manage_insights
#
# The scopes a connection actually holds are frozen at the moment you
# authorised it. Adding a scope to the app does nothing for connections made
# before that — they keep the old set until reconnected, and the insights
# calls quietly return errors that surface as empty analytics.
#
# This prints, per profile, whether its stored token carries the scope its
# network requires. RECONNECT means exactly that: Settings → Social profiles
# → reconnect that profile. No amount of waiting will fix it.
#
set -uo pipefail

PG="vass-organic-postgres"
DB_USER="vassorganic"
DB_NAME="vassorganic"

printf '%-34s %-16s %s\n' "PROFILE" "NETWORK" "INSIGHTS"
printf '%-34s %-16s %s\n' "-------" "-------" "--------"

docker exec -i "$PG" psql -U "$DB_USER" -d "$DB_NAME" -tAF'|' -c \
  "SELECT coalesce(meta->>'name', meta->>'username', external_id),
          platform,
          coalesce(array_to_string(scopes, ','), '')
     FROM organic_connected_accounts
    WHERE disconnected_at IS NULL
    ORDER BY platform, 1" |
while IFS='|' read -r name platform scopes; do
  [ -z "${name:-}" ] && continue

  case "$platform" in
    facebook_page) needed="read_insights" ;;
    instagram)     needed="instagram_manage_insights" ;;
    threads)       needed="threads_manage_insights" ;;
    *)             printf '%-34s %-16s %s\n' "${name:0:33}" "$platform" "n/a (no insights support)"; continue ;;
  esac

  case ",$scopes," in
    *",$needed,"*) verdict="ok" ;;
    *)             verdict="RECONNECT — missing $needed" ;;
  esac

  printf '%-34s %-16s %s\n' "${name:0:33}" "$platform" "$verdict"
done

cat <<'EOF'

Anything marked RECONNECT will report empty analytics no matter how long you
wait — the token simply cannot read insights. Reconnect it in
Settings → Social profiles.

Two caveats worth knowing before you reconnect everything:

  • Facebook Pages could never have worked. read_insights was not in the
    requested scope list at all until now, so every Page needs reconnecting
    once this deploy is live.

  • Reconnecting refreshes the scope set but does NOT backfill history.
    Insights are fetched per post going forward; older posts stay blank
    until a sync picks them up.
EOF
