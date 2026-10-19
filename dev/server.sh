#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# A throwaway Nextcloud for developing this fork, on http://localhost:8091.
#
#   dev/server.sh            start it (or report it is already up)
#   dev/server.sh --package dev/out/tasks-<v>.tar.gz
#                            start a separate one with that tarball installed
#                            instead of the checkout, on :8092, to prove a release
#   dev/server.sh --stop     remove both containers and their data
#
# The dev container bind-mounts this checkout as custom_apps/tasks, so after
# `npm run build` (or `npm run watch`) a browser reload shows the change. A
# version bump in appinfo/info.xml needs `occ upgrade`, which this runs.
#
# The image is pinned to the Nextcloud Paul's server runs; change NC_IMAGE when
# the server moves. SQLite, admin/admin: never expose it beyond localhost.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NC_IMAGE="${NC_IMAGE:-nextcloud:35.0.0-apache}"
DEV=tasks-dev
PKG=tasks-pkg

occ() { docker exec -u www-data "$1" php occ "${@:2}"; }

wait_ready() {
  local name="$1" port="$2"
  until curl -sf "http://localhost:$port/status.php" | grep -q '"installed":true'; do sleep 3; done
  # The image installs Nextcloud, then the entrypoint keeps running; give occ a moment.
  until occ "$name" status > /dev/null 2>&1; do sleep 2; done
}

start() {
  local name="$1" port="$2"; shift 2
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    echo "$name already running on :$port"
    return
  fi
  docker rm -f "$name" > /dev/null 2>&1 || true
  docker run -d --name "$name" -p "127.0.0.1:$port:80" \
    -e SQLITE_DATABASE=nextcloud -e NEXTCLOUD_ADMIN_USER=admin \
    -e NEXTCLOUD_ADMIN_PASSWORD=admin -e "NEXTCLOUD_TRUSTED_DOMAINS=localhost" \
    "$@" "$NC_IMAGE" > /dev/null
  echo "starting $name ($NC_IMAGE) on :$port…"
  wait_ready "$name" "$port"
  # Its welcome dialog covers the page on first login and swallows input.
  occ "$name" app:disable firstrunwizard > /dev/null 2>&1 || true
}

case "${1:-}" in
  --stop)
    docker rm -f "$DEV" "$PKG" 2>/dev/null || true
    ;;
  --package)
    TARBALL="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
    start "$PKG" 8092
    docker exec "$PKG" rm -rf /var/www/html/custom_apps/tasks
    docker exec -i "$PKG" tar -xz -C /var/www/html/custom_apps < "$TARBALL"
    docker exec "$PKG" chown -R www-data:www-data /var/www/html/custom_apps/tasks
    # A version different from what is recorded leaves the instance wanting an
    # upgrade, and occ refuses app:enable until that has run.
    occ "$PKG" upgrade > /dev/null 2>&1 || true
    occ "$PKG" app:enable tasks
    occ "$PKG" app:list --output=json | python3 -c \
      'import json,sys; a=json.load(sys.stdin)["enabled"]; print("tasks", a.get("tasks", "NOT ENABLED"))'
    echo "http://localhost:8092/index.php/apps/tasks  (admin/admin)"
    ;;
  "")
    start "$DEV" 8091 -v "$REPO:/var/www/html/custom_apps/tasks"
    occ "$DEV" upgrade > /dev/null 2>&1 || true
    occ "$DEV" app:enable tasks > /dev/null
    occ "$DEV" app:list --output=json | python3 -c \
      'import json,sys; a=json.load(sys.stdin)["enabled"]; print("tasks", a.get("tasks", "NOT ENABLED"))'
    echo "http://localhost:8091/index.php/apps/tasks  (admin/admin)"
    ;;
  *)
    sed -n '4,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
