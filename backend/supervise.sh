#!/bin/sh
# Supervisor for the Vass Organic backend container.
# Runs the API server and the queue worker as parallel child processes.
# Exits if either child dies, so Docker restarts the container.
#
# ---- Two deliberate differences from the ads app's version ----
#
# 1. NO `| sed -u` LOG PREFIXING.
#    The base image is node:20-alpine, whose sed is BusyBox, and BusyBox sed
#    has no -u (unbuffered) flag. The piped version fails immediately with
#    "sed: unrecognized option: u", which kills both children and crash-loops
#    the container. The ads install only survives because install-patch.sh
#    rewrites the file to strip -u on every patch — a fresh install never
#    gets that fixup. Both services already prefix their own log lines
#    ([worker] / [meta-sync] / [organic-publish]), so nothing is lost.
#
# 2. NO `wait -n`.
#    That is a bashism with patchy BusyBox ash support. A 5-second liveness
#    poll is portable and does the same job. It also fixes a latent bug in
#    the piped version: with `node ... | sed ... &`, $! is the PID of *sed*,
#    not node — so the supervisor was watching the wrong process and could
#    not notice the API dying behind a still-running pipe.
#
# Migrations do NOT run here. They run once at deploy time, via
# install-patch.sh or install.sh. A failing migration in the boot path
# crash-loops the container and takes the API down with it.

set -e

echo "[supervise] starting Vass Organic backend container"
echo "[supervise]   - API server"
echo "[supervise]   - publish/sync worker"

node dist/server.js &
API_PID=$!

node dist/worker.js &
WORKER_PID=$!

echo "[supervise] api pid=$API_PID worker pid=$WORKER_PID"

# Forward SIGTERM to both children for graceful shutdown
shutdown() {
  echo "[supervise] shutdown requested"
  kill -TERM "$API_PID" 2>/dev/null || true
  kill -TERM "$WORKER_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
  wait "$WORKER_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# Watch both children. When either dies, kill the other and exit non-zero so
# Docker restarts the whole container.
while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[supervise] API server exited — shutting down container"
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[supervise] worker exited — shutting down container"
    break
  fi
  sleep 5
done

kill -TERM "$API_PID" 2>/dev/null || true
kill -TERM "$WORKER_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true
exit 1
