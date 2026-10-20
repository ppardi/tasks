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
#   dev/server.sh --pause    stop all three containers, keeping their data
#   dev/server.sh --resume   start them again where they left off
#   dev/server.sh --stop     remove all three containers and their data
#
# A stopped container is resumed, never recreated: its Nextcloud and database
# live in volumes attached to it, and a new container would start empty.
#
# The dev container bind-mounts this checkout as custom_apps/tasks, so after
# `npm run build` (or `npm run watch`) a browser reload shows the change. A
# version bump in appinfo/info.xml needs `occ upgrade`, which this runs.
#
# The image is pinned to the Nextcloud Paul's server runs; change NC_IMAGE when
# the server moves. admin/admin: never expose it beyond localhost.
#
# The dev server uses SQLite, which is quick but takes one write at a time: two
# tasks saved together (a subtask and the parent it completes) can fail with
# "database is locked". The --package server uses PostgreSQL, as AIO does, so a
# release is proved against the database it will really run on.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NC_IMAGE="${NC_IMAGE:-nextcloud:35.0.0-apache}"
DEV=tasks-dev
PKG=tasks-pkg
PKG_DB=tasks-pkg-db
PKG_NET=tasks-pkg-net
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

occ() { docker exec -u www-data "$1" php occ "${@:2}"; }

wait_ready() {
  local name="$1" port="$2"
  until curl -sf "http://localhost:$port/status.php" | grep -q '"installed":true'; do sleep 3; done
  # The image installs Nextcloud, then the entrypoint keeps running; give occ a moment.
  until occ "$name" status > /dev/null 2>&1; do sleep 2; done
}

running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }
exists() { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }

start() {
  local name="$1" port="$2"; shift 2
  if running "$name"; then
    echo "$name already running on :$port"
    return
  fi
  if exists "$name"; then
    docker start "$name" > /dev/null
    echo "resuming $name on :$port…"
    wait_ready "$name" "$port"
    return
  fi
  docker run -d --name "$name" -p "127.0.0.1:$port:80" \
    -e NEXTCLOUD_ADMIN_USER=admin \
    -e NEXTCLOUD_ADMIN_PASSWORD=admin -e "NEXTCLOUD_TRUSTED_DOMAINS=localhost" \
    "$@" "$NC_IMAGE" > /dev/null
  echo "starting $name ($NC_IMAGE) on :$port…"
  wait_ready "$name" "$port"
  # Its welcome dialog covers the page on first login and swallows input.
  occ "$name" app:disable firstrunwizard > /dev/null 2>&1 || true
  # One scripted request with bad credentials otherwise throttles every later
  # request for minutes. Local-only instance, so nothing to protect.
  occ "$name" config:system:set auth.bruteforce.protection.enabled --type=boolean --value=false > /dev/null
}

start_pkg() {
  docker network inspect "$PKG_NET" > /dev/null 2>&1 || docker network create "$PKG_NET" > /dev/null
  if exists "$PKG_DB" && ! running "$PKG_DB"; then
    docker start "$PKG_DB" > /dev/null
  elif ! exists "$PKG_DB"; then
    docker run -d --name "$PKG_DB" --network "$PKG_NET" \
      -e POSTGRES_DB=nextcloud -e POSTGRES_USER=nextcloud -e POSTGRES_PASSWORD=nextcloud \
      "$PG_IMAGE" > /dev/null
  fi
  until docker exec "$PKG_DB" pg_isready -U nextcloud > /dev/null 2>&1; do sleep 1; done
  start "$PKG" 8092 --network "$PKG_NET" \
    -e POSTGRES_HOST="$PKG_DB" -e POSTGRES_DB=nextcloud \
    -e POSTGRES_USER=nextcloud -e POSTGRES_PASSWORD=nextcloud
}

case "${1:-}" in
  --pause)
    docker stop "$DEV" "$PKG" "$PKG_DB" > /dev/null 2>&1 || true
    echo "paused $DEV, $PKG, $PKG_DB (data kept; dev/server.sh --resume brings them back)"
    ;;
  --resume)
    exists "$PKG" && start_pkg
    exists "$DEV" && start "$DEV" 8091
    echo "http://localhost:8092/index.php/apps/tasks and http://localhost:8091/index.php/apps/tasks  (admin/admin)"
    ;;
  --stop)
    docker rm -f "$DEV" "$PKG" "$PKG_DB" 2>/dev/null || true
    docker network rm "$PKG_NET" > /dev/null 2>&1 || true
    ;;
  --package)
    TARBALL="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
    start_pkg
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
    start "$DEV" 8091 -e SQLITE_DATABASE=nextcloud -v "$REPO:/var/www/html/custom_apps/tasks"
    occ "$DEV" upgrade > /dev/null 2>&1 || true
    occ "$DEV" app:enable tasks > /dev/null
    occ "$DEV" app:list --output=json | python3 -c \
      'import json,sys; a=json.load(sys.stdin)["enabled"]; print("tasks", a.get("tasks", "NOT ENABLED"))'
    echo "http://localhost:8091/index.php/apps/tasks  (admin/admin)"
    ;;
  *)
    sed -n '4,22p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
