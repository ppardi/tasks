<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Loads sabre/vobject from the Nextcloud image's bundled libraries and the
 * app's own classes, so these tests need no Nextcloud test checkout.
 */

require_once __DIR__ . '/../../../vendor/autoload.php';
require_once '/usr/src/nextcloud/3rdparty/autoload.php';

spl_autoload_register(static function (string $class): void {
	$prefix = 'OCA\\Tasks\\';
	if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
		return;
	}
	$file = __DIR__ . '/../../../lib/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
	if (is_file($file)) {
		require_once $file;
	}
});
