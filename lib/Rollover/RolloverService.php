<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Rollover;

use DateTimeImmutable;
use DateTimeZone;
use OCA\DAV\CalDAV\CalDavBackend;
use OCP\App\IAppManager;
use OCP\IConfig;
use OCP\IDateTimeZone;
use OCP\IUser;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;

/**
 * Rolls each user's unfinished tasks over to their today, once per local day
 * (docs/ROLLOVER-DESIGN.md).
 *
 * Writes go through the dav app's CalDavBackend: the public OCP\Calendar API
 * can create calendar objects but not update them. updateCalendarObject records
 * the sync change and dispatches CalendarObjectUpdatedEvent, so CalDAV clients
 * (the Calendar app, Apple Reminders) pick the change up on their next sync.
 * It is internal API and is re-checked on every Nextcloud major.
 */
class RolloverService {
	/** Per-user app value: the local date (Y-m-d) last rolled over. */
	public const LAST_DATE = 'rollover_last_date';
	/** Per-user app value written by the Tasks settings: '0' turns rollover off. */
	public const SETTING = 'various_rollover';

	public function __construct(
		private CalDavBackend $calDav,
		private RolloverCalculator $calculator,
		private IConfig $config,
		private IUserManager $userManager,
		private IAppManager $appManager,
		private IDateTimeZone $dateTimeZone,
		private LoggerInterface $logger,
		private string $appName = 'tasks',
	) {
	}

	/**
	 * Rolls over every user whose local date has changed since their last run.
	 */
	public function rolloverDue(DateTimeImmutable $now): void {
		$this->userManager->callForSeenUsers(function (IUser $user) use ($now): void {
			$uid = $user->getUID();
			if (!$this->appManager->isEnabledForUser($this->appName, $user)
				|| $this->config->getUserValue($uid, $this->appName, self::SETTING, '1') === '0') {
				return;
			}
			$today = $now->setTimezone($this->zoneFor($uid))->format('Y-m-d');
			if ($this->config->getUserValue($uid, $this->appName, self::LAST_DATE, '') === $today) {
				return;
			}
			try {
				$written = $this->rolloverForUser($uid, $now);
				if ($written > 0) {
					$this->logger->info("Rolled over $written task(s) for $uid", ['app' => $this->appName]);
				}
			} catch (Throwable $e) {
				$this->logger->warning("Rollover failed for $uid: " . $e->getMessage(), ['app' => $this->appName, 'exception' => $e]);
			}
			// Marked even after a failure, so one broken calendar is not retried every hour
			$this->config->setUserValue($uid, $this->appName, self::LAST_DATE, $today);
		});
	}

	/**
	 * Rolls over the unfinished tasks in the calendars the user owns.
	 *
	 * @return int The number of tasks written
	 */
	public function rolloverForUser(string $uid, DateTimeImmutable $now): int {
		$zone = $this->zoneFor($uid);
		$principal = 'principals/users/' . $uid;
		$written = 0;
		foreach ($this->calDav->getCalendarsForUser($principal) as $calendar) {
			// A list shared with the user is its owner's to roll
			if (($calendar['{http://owncloud.org/ns}owner-principal'] ?? null) !== ($calendar['principaluri'] ?? null)) {
				continue;
			}
			// A list in the trash bin keeps its tasks as they were, in case it is restored
			if (!empty($calendar['{http://nextcloud.com/ns}deleted-at'])) {
				continue;
			}
			foreach ($this->calDav->getCalendarObjects($calendar['id']) as $row) {
				if (($row['component'] ?? '') !== 'vtodo') {
					continue;
				}
				try {
					$object = $this->calDav->getCalendarObject($calendar['id'], $row['uri']);
					if (!is_array($object) || empty($object['calendardata'])) {
						continue;
					}
					$vcalendar = Reader::read($object['calendardata']);
					if (!$vcalendar instanceof VCalendar || !$this->calculator->apply($vcalendar, $zone, $now)) {
						continue;
					}
					$this->calDav->updateCalendarObject($calendar['id'], $row['uri'], $vcalendar->serialize());
					$written++;
				} catch (Throwable $e) {
					$this->logger->warning("Rollover skipped {$row['uri']} for $uid: " . $e->getMessage(), ['app' => $this->appName, 'exception' => $e]);
				}
			}
		}
		return $written;
	}

	/**
	 * @return DateTimeZone The user's Nextcloud time zone, else the server's
	 *   default_timezone (PHP's own default is always UTC inside Nextcloud)
	 */
	private function zoneFor(string $uid): DateTimeZone {
		return $this->dateTimeZone->getTimeZone(false, $uid);
	}
}
