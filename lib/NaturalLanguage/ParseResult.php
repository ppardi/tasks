<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\NaturalLanguage;

use DateTimeImmutable;

/**
 * What the parser read from a new task's text (docs/NL-DATES-DESIGN.md).
 *
 * When nothing was read, $found is false, the title is the text as typed
 * (trimmed) and everything else is empty.
 */
final class ParseResult {
	/**
	 * @param string $title The text with the date and time words removed; place words stay
	 * @param ?DateTimeImmutable $due In the user's time zone; midnight for an all-day date
	 * @param bool $allDay Whether $due is a date without a time
	 * @param ?string $location The place, without a leading "the", "my" or "a"
	 * @param bool $found Whether a date, time or place was read
	 */
	public function __construct(
		public readonly string $title,
		public readonly ?DateTimeImmutable $due = null,
		public readonly bool $allDay = false,
		public readonly ?string $location = null,
		public readonly bool $found = false,
	) {
	}

	/**
	 * The result as plain values; the due date is local wall-clock time with
	 * no offset, all-day dates at midnight.
	 *
	 * @return array{title: string, due: ?string, allDay: bool, location: ?string, found: bool}
	 */
	public function toArray(): array {
		return [
			'title' => $this->title,
			// An all-day date is midnight even where the zone skips midnight
			'due' => $this->due?->format($this->allDay ? 'Y-m-d\T00:00:00' : 'Y-m-d\TH:i:s'),
			'allDay' => $this->allDay,
			'location' => $this->location,
			'found' => $this->found,
		];
	}
}
