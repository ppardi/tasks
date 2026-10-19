#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Run the fork's PHP unit tests (tests/php/rollover) without a Nextcloud test
# checkout:
#
#   dev/php-tests.sh [phpunit arguments]
#
# Upstream's PHP tests bootstrap from a full Nextcloud source tree and its
# test database; these do not. They run in a throwaway container of the same
# Nextcloud image the dev servers use, so PHP and sabre/vobject are the
# versions Nextcloud 35 ships. phpunit comes from the app's own require-dev,
# installed once into vendor/ (git-ignored, never packaged).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NC_IMAGE="${NC_IMAGE:-nextcloud:35.0.0-apache}"

if [ ! -x "$REPO/vendor/bin/phpunit" ]; then
	echo "installing phpunit into vendor/ (once)…"
	docker run --rm -v "$REPO":/app -w /app composer:2 \
		install --no-interaction --no-progress --ignore-platform-reqs > /dev/null
fi

docker run --rm -v "$REPO":/tasks -w /tasks --entrypoint php "$NC_IMAGE" \
	vendor/bin/phpunit -c phpunit.rollover.xml "$@"
