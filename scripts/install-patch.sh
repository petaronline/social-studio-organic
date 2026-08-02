#!/bin/bash
# Vass — patch installer (hardened)
# Usage:  /opt/vass-organic/install-patch.sh <patch-zip-path>

set -e
set -o pipefail

ZIP="$1"
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "Usage: $0 <path-to-vass-organic-patch-X.X.zip>"
  echo "       Zip must exist and be readable."
  exit 1
fi

# This MUST be the organic staging dir, not the ads app's (.../vass). When it
# pointed at .../vass, install-patch extracted organic's zip into the ADS
# staging tree and then copied the merged ads+organic backend into
# /opt/vass-organic — dragging ads-only files (sheet-parser.ts and its `xlsx`
# import, launches.ts, audits.ts, …) into organic, where they broke the
# TypeScript build. Keep this equal to deploy.sh's STAGING.
WORK="/home/petaronline/public_html/vass-organic"
LIVE="/opt/vass-organic"

echo "==> Extracting $ZIP into $WORK"
cd "$WORK"
unzip -o "$ZIP" > /dev/null

# DELETE.txt is an optional manifest at the zip root. Each non-empty,
# non-comment line is a path relative to $LIVE that should be removed
# BEFORE the new files are copied in. This is how we kill orphans
# (files that no longer exist in the patch but linger from earlier
# patches and break TypeScript builds via dead imports).
#
# Format:
#   # comments start with hash
#   frontend/src/components/old/Foo.tsx
#   backend/src/services/dead-service.ts
#
# Missing-file deletes are NOT an error — we use -f so re-running an
# install with the same DELETE.txt is idempotent.
if [ -f "$WORK/DELETE.txt" ]; then
  echo "==> Processing DELETE.txt manifest"
  while IFS= read -r line || [ -n "$line" ]; do
    # Strip trailing whitespace/CR; skip blanks and # comments
    path=$(echo "$line" | sed 's/[[:space:]]*$//')
    [ -z "$path" ] && continue
    case "$path" in \#*) continue ;; esac
    # Guard against absolute paths and parent-dir escapes
    case "$path" in
      /*) echo "   ! Skipping absolute path: $path"; continue ;;
      *..*) echo "   ! Skipping path with ..: $path"; continue ;;
    esac
    target="$LIVE/$path"
    if [ -e "$target" ] || [ -L "$target" ]; then
      rm -rf "$target"
      echo "   - Removed $path"
    else
      echo "   . Skipped (already gone): $path"
    fi
  done < "$WORK/DELETE.txt"
fi

# Wipe the live source trees before copying the patch in. cp -rf MERGES —
# it never deletes a file the new patch dropped — so without this, any file
# that once shipped and later got removed lingers forever and can break the
# build via a dead import. The zip always carries the complete src, so
# clearing it first is safe and makes /opt match the repo exactly. dist is
# cleared too so no stale compiled output survives. (node_modules, .next and
# the Docker build are untouched.)
echo "==> Clearing live source trees (orphan-proofing)"
rm -rf "$LIVE/backend/src" "$LIVE/backend/dist" "$LIVE/frontend/src"

echo "==> Copying patch into $LIVE"
\cp -rf backend "$LIVE/" 2>/dev/null || true
\cp -rf frontend "$LIVE/" 2>/dev/null || true

# Self-update: if the patch ships a new install-patch.sh, replace the
# live one. The script users actually invoke lives at /opt/vass-organic/install-patch.sh
# (not under /opt/vass-organic/scripts/). Won't take effect this run (we're
# already executing), but the next install picks up the new behavior.
if [ -f "$WORK/scripts/install-patch.sh" ]; then
  \cp -f "$WORK/scripts/install-patch.sh" "$LIVE/install-patch.sh"
  chmod +x "$LIVE/install-patch.sh"
  echo "   Updated $LIVE/install-patch.sh (effective next install)"
fi

echo "==> Defensively fixing supervise.sh (BusyBox sed -u bug)"
if [ -f "$LIVE/backend/supervise.sh" ]; then
  sed -i 's| sed -u | sed |g' "$LIVE/backend/supervise.sh"
  chmod +x "$LIVE/backend/supervise.sh"
fi

echo "==> Rebuilding containers (backend + frontend, force-recreate)"
cd "$LIVE"
docker compose up -d --build --force-recreate backend frontend

echo "==> Waiting for backend container to be ready"
# Poll for backend container existence + health, max 30s
for i in $(seq 1 30); do
  if docker compose exec -T backend echo ok > /dev/null 2>&1; then
    echo "   Backend reachable after ${i}s"
    break
  fi
  sleep 1
done

echo "==> Running migrations (will ABORT on failure)"
if ! docker compose exec -T backend npm run migrate; then
  echo ""
  echo "✗ ✗ ✗  Migration FAILED. Install incomplete."
  echo ""
  echo "Backend will be crashing until migrations succeed or you roll back."
  echo "Recent backend logs:"
  docker compose logs --tail=20 backend
  exit 2
fi

echo "==> Restarting backend to pick up post-migration schema"
docker compose restart backend
sleep 3

echo "==> Final container status"
docker compose ps

echo ""
echo "✓ Patch installed and migrations applied."
echo "   Tail logs:    docker compose logs -f backend"
echo "   Last 30 lines: docker compose logs --tail=30 backend"
