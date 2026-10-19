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

## Daily loop

```
. dev/env.sh
dev/server.sh                 # http://localhost:8091/index.php/apps/tasks, admin/admin
npm run watch                 # rebuilds js/ on save; reload the browser
npm test                      # vitest
```

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
