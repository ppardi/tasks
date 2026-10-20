<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\NaturalLanguage;

use DateTimeZone;
use OCP\IConfig;
use OCP\IDateTimeZone;
use Throwable;

/**
 * The time zone that decides what "today" is for a user when reading a task's
 * dates: their Nextcloud time zone (core/timezone), else the server's default.
 *
 * Never the session's browser offset, which IDateTimeZone::getTimeZone() falls
 * back to for the logged-in user: a CalDAV client has no browser, and the
 * phone's arrivals must read the same "tomorrow" as the agent's.
 */
class UserZone {
	public function __construct(
		private IConfig $config,
		private IDateTimeZone $dateTimeZone,
	) {
	}

	public function for(string $uid): DateTimeZone {
		$name = $this->config->getUserValue($uid, 'core', 'timezone', '');
		if ($name !== '') {
			try {
				return new DateTimeZone($name);
			} catch (Throwable) {
				// An unknown name: the server's default, as Nextcloud does
			}
		}
		return $this->dateTimeZone->getDefaultTimeZone();
	}
}
