#!/usr/bin/env bash
#
# check-avatars.sh — show, for every connected Facebook Page, where its
# stored picture URL ACTUALLY lands after following redirects.
#
# Run as root on the server:
#     bash /opt/vass-organic/scripts/check-avatars.sh
#
# This exists because four rounds of fixes were built on Graph's
# `is_silhouette` field, which reports false for Pages whose picture
# endpoint serves the grey placeholder anyway. The redirect target is the
# only reliable answer, so this prints it: for each Page you get the stored
# URL, the final URL after redirects, and a verdict.
#
# PLACEHOLDER means the app should be showing initials for that profile.
# If a row says PLACEHOLDER and you still see a grey image in the UI, the
# problem is in the frontend, not the data — and vice versa. Either way it
# stops the guessing.
#
set -uo pipefail

PG="vass-organic-postgres"
DB_USER="vassorganic"
DB_NAME="vassorganic"

echo "Reading connected Facebook Pages…"
echo

docker exec -i "$PG" psql -U "$DB_USER" -d "$DB_NAME" -tAF'|' -c \
  "SELECT coalesce(meta->>'name','(no name)'), coalesce(meta->>'picture_url','')
     FROM organic_connected_accounts
    WHERE disconnected_at IS NULL
      AND platform = 'facebook_page'
    ORDER BY 1" |
while IFS='|' read -r name url; do
  [ -z "${name:-}" ] && continue

  if [ -z "${url:-}" ]; then
    printf '%-38s %s\n' "$name" "no picture stored → initials (correct)"
    continue
  fi

  # -L follows redirects; %{url_effective} is where it ended up.
  final=$(curl -sL -o /dev/null -w '%{url_effective}' --max-time 10 "$url" 2>/dev/null)

  case "$final" in
    *static.xx.fbcdn.net*|*static.cdninstagram.com*|*rsrc.php*|*/t1.30497-1/*)
      verdict="PLACEHOLDER → should show initials" ;;
    "")
      verdict="unreachable (kept as-is)" ;;
    *)
      verdict="real photo" ;;
  esac

  printf '%-38s %s\n' "$name" "$verdict"
  printf '%-38s   stored: %s\n' "" "${url:0:110}"
  printf '%-38s   final : %s\n' "" "${final:0:110}"
  echo
done

cat <<'EOF'
If a Page says PLACEHOLDER, the backend will now return null for it and the
UI will draw two letters on the platform tint.

If one says "real photo" but you see grey on screen, send me that block —
it means the redirect resolves differently from inside the container than it
does from your browser, which is a different problem entirely.
EOF
