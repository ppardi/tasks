<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\NaturalLanguage;

use DateTimeImmutable;
use DateTimeZone;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Property;
use Sabre\VObject\Property\ICalendar\DateTime as DateTimeProperty;

/**
 * Fills in a task that arrives from another client (the phone, an agent) from
 * its title: due date, place and the automatic reminder (docs/NL-DATES-DESIGN.md,
 * "Tasks arriving from anything else"). Pure: no Nextcloud services, no I/O.
 *
 * The caller has checked the request (a create, by a user with the setting
 * on, not from the web app); this checks the object.
 *
 * - Only a new, plain, open task: one VTODO, no RECURRENCE-ID or RRULE, not
 *   completed or cancelled, no DTSTART, no VALARM, and CREATED (else DTSTAMP)
 *   within ten minutes of now. A task moved or imported keeps its old dates.
 * - Without a due date, the title's date, time and place are read: the date
 *   and time words leave the title, and so does a leading "Remind me to" when
 *   any of them was found.
 * - With a due date, the sender's date wins: only a place is read, the title
 *   stays, and the automatic reminder is added.
 * - It writes SUMMARY, DUE, LOCATION (only if empty), the automatic reminder
 *   and the two marks Undo reads, and nothing else: an arrival is not an edit.
 */
class ArrivalParser {
	/** The title as it arrived, for Undo. */
	public const ORIGINAL_SUMMARY = 'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY';
	/** What was added, as a comma list of DUE and LOCATION, for Undo. */
	public const FILLED = 'X-NEXTCLOUD-TASKS-FILLED';
	/** Inside the VALARM the server added, so Undo finds it in any time zone. */
	public const AUTOMATIC = 'X-NEXTCLOUD-TASKS-AUTOMATIC';

	/** How far CREATED (or DTSTAMP) may be from now, either side, in seconds. */
	private const FRESH = 10 * 60;
	private const MORNING_HOUR = 9;

	public function __construct(
		private Parser $parser = new Parser(),
	) {
	}

	/**
	 * @param VCalendar $calendar The calendar object being created; changed in place
	 * @param DateTimeZone $zone The user's time zone, which decides what "today" is
	 * @param DateTimeImmutable $now The current moment
	 * @return bool Whether the task was changed
	 */
	public function apply(VCalendar $calendar, DateTimeZone $zone, DateTimeImmutable $now): bool {
		$todo = $this->arrivingTask($calendar, $now);
		if ($todo === null) {
			return false;
		}
		$summary = $this->text($todo->SUMMARY ?? null);
		$hasLocation = trim($this->text($todo->LOCATION ?? null)) !== '';

		if (isset($todo->DUE)) {
			// The sender's date wins: read a place only, and keep the title
			$result = $this->parser->parse($summary, $now, $zone, [Parser::IGNORE_DATE]);
			$title = null;
			$due = null;
			$reminder = $this->reminderForDue($todo->DUE, $zone, $now);
		} else {
			$result = $this->parser->parse($summary, $now, $zone);
			if (!$result->found) {
				return false;
			}
			// The parser's title, as the New task box shows it: with a place
			// alone it differs only by a leading "Remind me to"
			$title = $result->title !== trim($summary) ? $result->title : null;
			$due = $result->due;
			$reminder = $due !== null ? $this->upcoming($this->automaticReminderTime($due, $result->allDay), $now) : null;
		}
		$location = !$hasLocation ? $result->location : null;
		if ($due === null && $location === null && $reminder === null) {
			return false;
		}

		$filled = [];
		if ($title !== null) {
			$todo->SUMMARY = $title;
		}
		if ($due !== null) {
			$this->setDue($todo, $due, $result->allDay);
			$filled[] = 'DUE';
		}
		if ($location !== null) {
			$todo->LOCATION = $location;
			$filled[] = 'LOCATION';
		}
		if ($reminder !== null) {
			$this->addReminder($todo, $reminder);
		}
		$this->mark($todo, $summary, $filled);
		return true;
	}

	/**
	 * Writes the marks Undo reads, replacing any copied from another task. The
	 * web app reads them with ical.js, which keeps an X- property's escapes
	 * unless it says VALUE=TEXT; the list is written as parts, so its commas
	 * are not escaped.
	 *
	 * @param list<string> $filled
	 */
	private function mark(Component $todo, string $summary, array $filled): void {
		$todo->remove(self::ORIGINAL_SUMMARY);
		$todo->remove(self::FILLED);
		$todo->add(self::ORIGINAL_SUMMARY, $summary, ['VALUE' => 'TEXT']);
		// Only the reminder added: no list at all, rather than an empty one
		if ($filled) {
			$todo->add(self::FILLED, $filled);
		}
	}

	/**
	 * @return Component|null The task, when the object is a new, plain, open one
	 */
	private function arrivingTask(VCalendar $calendar, DateTimeImmutable $now): ?Component {
		$todos = [];
		foreach ($calendar->getComponents() as $component) {
			if ($component->name === 'VTODO') {
				$todos[] = $component;
			} elseif ($component->name !== 'VTIMEZONE') {
				// An event or a journal is not a task
				return null;
			}
		}
		if (count($todos) !== 1) {
			return null;
		}
		$todo = $todos[0];
		foreach (['RECURRENCE-ID', 'RRULE', 'DTSTART', 'VALARM', 'COMPLETED'] as $name) {
			if (isset($todo->{$name})) {
				return null;
			}
		}
		$status = strtoupper((string)($todo->STATUS ?? ''));
		if ($status === 'COMPLETED' || $status === 'CANCELLED') {
			return null;
		}
		return $this->isFresh($todo, $now) ? $todo : null;
	}

	/**
	 * CREATED within ten minutes of now, either side (a phone's clock may run
	 * fast); without CREATED, DTSTAMP. A task moved between lists or imported
	 * carries its old dates and is left alone.
	 */
	private function isFresh(Component $todo, DateTimeImmutable $now): bool {
		$stamp = $todo->CREATED ?? $todo->DTSTAMP ?? null;
		if (!$stamp instanceof DateTimeProperty) {
			return false;
		}
		try {
			$at = $stamp->getDateTime();
		} catch (\Throwable) {
			return false;
		}
		return abs($at->getTimestamp() - $now->getTimestamp()) <= self::FRESH;
	}

	/**
	 * The automatic reminder for a due date the task arrived with, or null when
	 * its time has passed or its zone is unknown (the time would be a guess).
	 */
	private function reminderForDue(Property $dueProperty, DateTimeZone $zone, DateTimeImmutable $now): ?DateTimeImmutable {
		if (!$dueProperty instanceof DateTimeProperty) {
			return null;
		}
		$tzid = $dueProperty['TZID'];
		try {
			if ($tzid !== null) {
				new DateTimeZone((string)$tzid);
			}
			$due = DateTimeImmutable::createFromInterface($dueProperty->getDateTime($zone))->setTimezone($zone);
		} catch (\Throwable) {
			return null;
		}
		return $this->upcoming($this->automaticReminderTime($due, !$dueProperty->hasTime()), $now);
	}

	/**
	 * Where the automatic reminder goes, as src/utils/reminders.js has it: at
	 * the due time, or 9:00 AM on the due day for an all-day due date or one at
	 * exactly midnight.
	 *
	 * @param DateTimeImmutable $due The due date, in the user's time zone
	 */
	private function automaticReminderTime(DateTimeImmutable $due, bool $allDay): DateTimeImmutable {
		if ($allDay || $due->format('H:i:s') === '00:00:00') {
			return $due->setTime(self::MORNING_HOUR, 0);
		}
		return $due;
	}

	/**
	 * @return DateTimeImmutable|null The reminder, or null once its time has passed
	 */
	private function upcoming(DateTimeImmutable $at, DateTimeImmutable $now): ?DateTimeImmutable {
		return $at > $now ? $at : null;
	}

	private function setDue(Component $todo, DateTimeImmutable $due, bool $allDay): void {
		if ($allDay) {
			$todo->add('DUE', $due->format('Ymd'), ['VALUE' => 'DATE']);
			return;
		}
		$todo->add('DUE', $this->utc($due));
	}

	private function addReminder(Component $todo, DateTimeImmutable $at): void {
		$alarm = $todo->add('VALARM', [
			'ACTION' => 'DISPLAY',
			'DESCRIPTION' => 'Reminder',
		]);
		$alarm->add('TRIGGER', $this->utc($at), ['VALUE' => 'DATE-TIME']);
		$alarm->add(self::AUTOMATIC, '1');
	}

	/**
	 * A text property's value, unescaped. A client that forgets to escape a
	 * comma gets its value split into parts by sabre; they are joined back.
	 */
	private function text(?Property $property): string {
		return $property === null ? '' : implode(',', $property->getParts());
	}

	private function utc(DateTimeImmutable $moment): string {
		return $moment->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
	}
}
