<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Rollover;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Property\ICalendar\DateTime as DateTimeProperty;
use Sabre\VObject\Recur\RRuleIterator;

/**
 * Works out whether an unfinished task rolls over to today, and rewrites it if
 * so (docs/ROLLOVER-DESIGN.md). Pure: no Nextcloud services, no I/O.
 *
 * - A task due before the user's today moves to today, keeping its time of
 *   day; its start date and fixed-time reminders move with it.
 * - A task without a due date whose fixed-time reminders are all before today
 *   moves its reminders, so the latest lands on today.
 * - A repeating task is never moved between occurrences: once a newer
 *   occurrence is today or earlier it jumps to the latest one, counting the
 *   occurrences it missed and using them up from COUNT.
 */
class RolloverCalculator {
	public const ORIGINAL_DUE = 'X-NEXTCLOUD-TASKS-ORIGINAL-DUE';
	public const ORIGINAL_REMINDER = 'X-NEXTCLOUD-TASKS-ORIGINAL-REMINDER';
	public const MISSED = 'X-NEXTCLOUD-TASKS-MISSED';

	/** Guards against a pathological rule; ten years of daily occurrences. */
	private const MAX_OCCURRENCES = 3660;

	/**
	 * @param VCalendar $calendar The calendar object holding the task; changed in place
	 * @param DateTimeZone $zone The user's time zone, which decides what "today" is
	 * @param DateTimeImmutable $now The current moment
	 * @return bool Whether the task was changed
	 */
	public function apply(VCalendar $calendar, DateTimeZone $zone, DateTimeImmutable $now): bool {
		$todo = $calendar->VTODO ?? null;
		if (!$todo instanceof Component || $this->isClosed($todo)) {
			return false;
		}
		$today = $now->setTimezone($zone)->setTime(0, 0);

		if (isset($todo->DUE)) {
			return $this->rollDue($todo, $zone, $today);
		}
		return $this->rollReminders($todo, $zone, $today);
	}

	private function isClosed(Component $todo): bool {
		$status = strtoupper((string)($todo->STATUS ?? ''));
		return $status === 'COMPLETED' || $status === 'CANCELLED' || isset($todo->COMPLETED);
	}

	private function rollDue(Component $todo, DateTimeZone $zone, DateTimeImmutable $today): bool {
		/** @var DateTimeProperty $dueProperty */
		$dueProperty = $todo->DUE;
		$due = $this->local($dueProperty, $zone);
		if ($this->day($due) >= $today) {
			return false;
		}

		if (isset($todo->RRULE)) {
			$result = $this->rollRepeating($todo, $zone, $due, $today);
			if ($result !== null) {
				return $result;
			}
			// The series has ended: nothing to keep in step with, roll it like any task
		}

		$days = $this->daysBetween($this->day($due), $today);
		if (!isset($todo->{self::ORIGINAL_DUE})) {
			$original = $todo->add(self::ORIGINAL_DUE, (string)$dueProperty);
			if (!$dueProperty->hasTime()) {
				$original['VALUE'] = 'DATE';
			}
		}
		$this->shiftDates($todo, $zone, $days);
		$this->touch($todo);
		return true;
	}

	/**
	 * @return bool|null Whether it changed the task, or null when the series has ended
	 */
	private function rollRepeating(Component $todo, DateTimeZone $zone, DateTimeImmutable $due, DateTimeImmutable $today): ?bool {
		$iterator = new RRuleIterator((string)$todo->RRULE, $due);
		$index = 0;
		$latestIndex = 0;
		$latest = $due;
		$hasNext = false;
		while ($iterator->valid() && $index < self::MAX_OCCURRENCES) {
			$occurrence = DateTimeImmutable::createFromInterface($iterator->current())->setTimezone($zone);
			if ($index > 0) {
				if ($this->day($occurrence) > $today) {
					$hasNext = true;
					break;
				}
				$latest = $occurrence;
				$latestIndex = $index;
			}
			$index++;
			$iterator->next();
		}

		if ($latestIndex === 0) {
			// No newer occurrence has come: it stays on its own date (Paul's answer 2A).
			// No occurrence after it at all: the series is over.
			return $hasNext ? false : null;
		}

		$days = $this->daysBetween($this->day($due), $this->day($latest));
		$this->shiftDates($todo, $zone, $days);
		$missed = (int)(string)($todo->{self::MISSED} ?? 0) + $latestIndex;
		$todo->{self::MISSED} = (string)$missed;
		$this->useUpCount($todo, $latestIndex);
		$this->touch($todo);
		return true;
	}

	private function useUpCount(Component $todo, int $used): void {
		$parts = $todo->RRULE->getParts();
		if (!isset($parts['COUNT'])) {
			return;
		}
		$parts['COUNT'] = max(1, (int)$parts['COUNT'] - $used);
		$todo->RRULE->setParts($parts);
	}

	private function rollReminders(Component $todo, DateTimeZone $zone, DateTimeImmutable $today): bool {
		$latest = null;
		foreach ($this->fixedTriggers($todo) as $trigger) {
			$at = $trigger->getDateTime()->setTimezone($zone);
			if ($latest === null || $at > $latest) {
				$latest = $at;
			}
		}
		if ($latest === null || $this->day($latest) >= $today) {
			return false;
		}

		if (!isset($todo->{self::ORIGINAL_REMINDER})) {
			$todo->add(self::ORIGINAL_REMINDER, $latest->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z'));
		}
		$this->shiftTriggers($todo, $zone, $this->daysBetween($this->day($latest), $today));
		$this->touch($todo);
		return true;
	}

	/**
	 * Moves DUE, DTSTART and every fixed-time reminder by whole days in the
	 * user's calendar, keeping each one's time of day and value type.
	 */
	private function shiftDates(Component $todo, DateTimeZone $zone, int $days): void {
		foreach (['DUE', 'DTSTART'] as $name) {
			if (isset($todo->{$name})) {
				$this->shiftProperty($todo->{$name}, $zone, $days);
			}
		}
		$this->shiftTriggers($todo, $zone, $days);
	}

	private function shiftTriggers(Component $todo, DateTimeZone $zone, int $days): void {
		foreach ($this->fixedTriggers($todo) as $trigger) {
			$at = $trigger->getDateTime()->setTimezone($zone)->modify("+$days days");
			$trigger->setValue($at->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z'));
		}
	}

	private function shiftProperty(DateTimeProperty $property, DateTimeZone $zone, int $days): void {
		if (!$property->hasTime()) {
			$property->setValue($this->local($property, $zone)->modify("+$days days")->format('Ymd'));
			return;
		}
		if ($property->isFloating()) {
			$property->setDateTime($this->local($property, $zone)->modify("+$days days"), true);
			return;
		}
		// Keep the property's own zone (UTC or TZID); move it a calendar day at a time
		$own = $property->getDateTime();
		$moved = $own->setTimezone($zone)->modify("+$days days")->setTimezone($own->getTimezone());
		if (str_ends_with((string)$property->getValue(), 'Z')) {
			$property->setValue($moved->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z'));
		} else {
			$property->setDateTime($moved);
		}
	}

	/**
	 * @return iterable<DateTimeProperty> The TRIGGERs with a fixed date and time
	 */
	private function fixedTriggers(Component $todo): iterable {
		foreach ($todo->select('VALARM') as $alarm) {
			$trigger = $alarm->TRIGGER ?? null;
			if ($trigger instanceof DateTimeProperty
				|| ($trigger !== null && strtoupper((string)($trigger['VALUE'] ?? '')) === 'DATE-TIME')) {
				yield $trigger;
			}
		}
	}

	private function local(DateTimeProperty $property, DateTimeZone $zone): DateTimeImmutable {
		return DateTimeImmutable::createFromInterface($property->getDateTime($zone))->setTimezone($zone);
	}

	private function day(DateTimeInterface $moment): DateTimeImmutable {
		return DateTimeImmutable::createFromInterface($moment)->setTime(0, 0);
	}

	private function daysBetween(DateTimeImmutable $from, DateTimeImmutable $to): int {
		return (int)$from->diff($to)->format('%r%a');
	}

	private function touch(Component $todo): void {
		$stamp = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Ymd\THis\Z');
		$todo->{'LAST-MODIFIED'} = $stamp;
		$todo->DTSTAMP = $stamp;
	}
}
