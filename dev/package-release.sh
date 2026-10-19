#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Package a release tarball for this fork.
#
# Upstream's `make appstore` is not used, for two reasons:
#   - it names the package after the checkout directory (app_name=$(notdir
#     $(CURDIR))), so from NextCloud-Tasks it ships a NextCloud-Tasks/ folder
#     that Nextcloud will not recognise as the tasks app;
#   - it rsyncs the working tree, so anything lying around in it ships too.
# This packs the committed tree from `git archive`, adds the freshly built js/
# and css/ (both git-ignored), and strips the same files `make appstore` does.
#
# Writes to dev/out (or $TASKS_DEV_OUT):
#   tasks-<version>.tar.gz   the app
#   SHA256SUMS               its checksum, named exactly as the release needs
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TASKS_DEV_OUT:-$REPO/dev/out}"
V="$(sed -n 's|.*<version>\(.*\)</version>.*|\1|p' "$REPO/appinfo/info.xml" | head -1)"
STAGE="$OUT/stage-$V"

if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]; then
  echo "uncommitted changes to tracked files; the package is built from HEAD, so commit first" >&2
  exit 1
fi
PKG_V="$(sed -n 's|^  "version": "\(.*\)",|\1|p' "$REPO/package.json" | head -1)"
[ "$PKG_V" = "$V" ] || { echo "info.xml says $V but package.json says $PKG_V" >&2; exit 1; }

# shellcheck source=dev/env.sh
. "$REPO/dev/env.sh"
mkdir -p "$OUT"
echo "packaging tasks $V (node $(node -v))"
# What `make clean` does, so chunks from an earlier build cannot ride along.
# css/tasks-icon.css is the one tracked file in css/.
rm -rf "$REPO/js"
find "$REPO/css" -mindepth 1 ! -name tasks-icon.css -delete
(cd "$REPO" && npm run build > "$OUT/build.log" 2>&1) \
  || { echo "build failed; see $OUT/build.log" >&2; exit 1; }

rm -rf "$STAGE" && mkdir -p "$STAGE/tasks"
git -C "$REPO" archive HEAD | tar -x -C "$STAGE/tasks"
rm -rf "$STAGE/tasks/js" "$STAGE/tasks/css"
cp -R "$REPO/js" "$STAGE/tasks/js"
cp -R "$REPO/css" "$STAGE/tasks/css"

# The exclude list from upstream's `make appstore`, plus this fork's dev/.
cd "$STAGE/tasks"
for p in .github .babelrc .babelrc.js .codecov.yml .editorconfig .eslintrc.cjs \
         .gitattributes .gitignore .phpunit.result.cache .php-cs-fixer.dist.php.cache \
         .php-cs-fixer.dist.php .gitlab-ci.yml .prettierrc.js .scrutinizer.yml \
         .stylelintignore .stylelintrc .travis.yml .tx babel.config.cjs build.xml \
         clover.integration.xml clover.unit.xml composer.json composer.lock composer.phar \
         CONTRIBUTING.md issue_template.md gulpfile.js Makefile package-lock.json \
         package.json phpunit.xml phpunit.integration.xml README.md stylelint.config.js \
         vite.config.mjs build coverage img/src src node_modules screenshots test tests \
         vendor dev; do
  rm -rf "$p"
done
rm -f .v8flags*.json

[ -f appinfo/info.xml ] && [ -f js/tasks-main.mjs ] \
  || { echo "package is missing appinfo/info.xml or js/tasks-main.mjs" >&2; exit 1; }

cd "$STAGE"
COPYFILE_DISABLE=1 tar -czf "$OUT/tasks-$V.tar.gz" tasks
cd "$OUT"
# The release asset must be named exactly SHA256SUMS. A versioned name uploads
# fine and is then silently ignored by the installer that watches releases.
shasum -a 256 "tasks-$V.tar.gz" > SHA256SUMS
cat SHA256SUMS
echo "contents: $(tar -tzf "tasks-$V.tar.gz" | wc -l | tr -d ' ') entries"
rm -rf "$STAGE"
echo
echo "to publish:"
echo "  gh release create v$V --repo ppardi/tasks --prerelease \\"
echo "    --title \"$V — <what it does>\" --notes-file <notes.md> \\"
echo "    \"$OUT/tasks-$V.tar.gz\" \"$OUT/SHA256SUMS\""
