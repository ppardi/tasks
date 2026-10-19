<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Development scripts

Tooling for this fork. None of it ships: `dev/package-release.sh` strips `/dev/`
from the release tarball.

| Script | What it does |
| --- | --- |
| `env.sh` | Sourced, not run. Puts a Node 24 on `PATH` when the default `node` is older, since `package.json` requires `^24`. |
| `server.sh` | A throwaway Nextcloud on `:8091` with this checkout bind-mounted as `custom_apps/tasks`. `--package <tarball>` starts a second one on `:8092` with a release installed instead; `--stop` removes both. |
| `package-release.sh` | Cleans, builds, and packs `dev/out/tasks-<version>.tar.gz` plus its `SHA256SUMS`. |
| `php-tests.sh` | Runs the fork's PHP unit tests (`tests/php/rollover`) in a throwaway Nextcloud 35 container: no Nextcloud test checkout needed. Installs phpunit into `vendor/` once. |
| `seed.sh` | Fills the dev server with an "Immediate Tasks" list shaped like Paul's: reminder-only tasks, overdue and upcoming dates, priorities, a note, tags, subtasks, a completed task. Dates are relative to today; re-running overwrites. |

## Daily loop

```
. dev/env.sh
dev/server.sh                 # http://localhost:8091/index.php/apps/tasks, admin/admin
dev/seed.sh                   # once, for realistic tasks
npm run watch                 # rebuilds js/ on save; reload the browser
npm test                      # vitest
```

For Paul's look, switch the dev user to the dark theme once:
`docker exec -u www-data tasks-dev php occ user:setting admin theming enabled-themes '["dark"]'`.

## Releasing

Versions are `0.99.<n>`: upstream is pre-1.0 and bumps the minor for features,
so `0.99` outranks every 0.x the app store will ship and the store never
replaces the build. If upstream reaches 1.0, move to `1.99.<n>`.

1. Bump `<version>` in `appinfo/info.xml` and `version` in `package.json`
   (`npm version 0.99.<n> --no-git-tag-version` does both and the lock file).
   Commit as `chore(release): 0.99.<n>`.
2. `dev/package-release.sh` — refuses to run with uncommitted changes, because
   it packs `HEAD`.
3. `dev/server.sh --package dev/out/tasks-0.99.<n>.tar.gz` and check it loads.
4. Only when Paul says go: push the branch and tag, then `gh release create`
   as the script prints. Publishing a release makes the server watcher install
   it within 15 minutes.

## Things that will bite

**A rebuild does not reach an open browser tab.** `tasks-main.mjs` is loaded
as `?v=<hash>`, and the hash only changes with the app version, so the browser
keeps the old entry file. Hard-reload, or refresh those URLs from the console:
`await Promise.all([...document.querySelectorAll('script[src*="/tasks/"], link[href*="/tasks/"]')].map(e => fetch(e.src || e.href, {cache: 'reload'}))); location.reload()`.
The chunks it imports are content-hashed and need nothing.

**Brute-force protection is off in the dev servers**, because one scripted
request with bad credentials throttled every request after it. Turning it off
does not forgive attempts already recorded; if it ever reappears, delete the
rows from `oc_bruteforce_attempts`.

**Nextcloud 35 draws input outlines with `box-shadow`, not `border`.** An
override of `border-color` alone leaves the outline in place.

**Do not use `make appstore`.** It names the package after the checkout
directory, so from `NextCloud-Tasks` it produces a `NextCloud-Tasks/` folder,
and it rsyncs the working tree, so stray files ship.

**`js/` and `css/` are build output and git-ignored**, except
`css/tasks-icon.css`. The package script copies them in after a clean build.

**A version bump needs `occ upgrade`** before Nextcloud will serve again.
`server.sh` runs it; on the real server the watcher does.

**The `SHA256SUMS` release asset must be named exactly that.** A versioned name
uploads happily and is then ignored by the installer that watches releases.

**npm 11 blocks install scripts by default** and prints a warning for
esbuild's postinstall. The build works without it; leave it unless the build
starts failing.
