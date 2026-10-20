<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\NaturalLanguage;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Reads a due date, a time and a place out of a new task's text, in English
 * (docs/NL-DATES-DESIGN.md). Pure: no Nextcloud services, no I/O.
 *
 * - The first date phrase ("tomorrow", "on July 3rd", "next Tuesday", "by
 *   11/1") and the first time phrase ("at 3", "10am", "this evening",
 *   "tonight at 8") are read and removed from the title. Later ones stay.
 * - A place ("at the grocery store", "at Mom's") is read only when sure, and
 *   its words stay in the title.
 * - "Remind me to" at the start goes, but only when something else was read.
 *
 * Positions in the text are byte offsets; they never leave this class.
 */
class Parser {
	public const IGNORE_DATE = 'date';
	public const IGNORE_PLACE = 'place';

	private const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
	/**
	 * Full day names, and the short forms that are not everyday words: "sun",
	 * "sat", "mon" ("C'mon") and "wed" are left out.
	 */
	private const WEEKDAY = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues?|thu(?:rs?)?|fri)';
	/** "on" or "by" in front of a date belongs to it and goes with it. */
	private const ON = '(?:(?:on|by)\s+)?';
	/**
	 * Only "by" in front of today and tomorrow: nobody writes "on tomorrow", so
	 * an "on" there is a verb's ("Log on tomorrow").
	 */
	private const BY = '(?:by\s+)?';
	/** Not a possessive: "tomorrow's agenda" is no date. The second form is ’ in UTF-8 bytes. */
	private const NOT_POSSESSIVE = '(?!(?:\'|\xE2\x80\x99)s\b)';
	private const PART_OF_DAY = '(?:in\s+the\s+|this\s+)?(morning|afternoon|evening)|(tonight)';
	/** What ends the text before a repeat phrase: "every Monday", "each morning", "every other Friday". */
	private const REPEAT = '/\b(?:every|each)\s+(?:other\s+)?$/i';
	/**
	 * A year after a month and day: after a comma ("August 10, 2012"), or where
	 * a year can end: the end of the text, punctuation or a time. "Jan 5 2000
	 * units" has no year. Two groups: the comma form, then the other.
	 */
	private const YEAR = '(?:,\s*(\d{4})\b|\s+(\d{4})\b(?=\s*$|\s*[^\w\s]|\s+(?:at\s+\d|\d{1,2}(?::\d{2}|\s*[ap]\.?m\b)|noon\b)))?';
	/** Month words that are also everyday words: "Print 2 May flyers". */
	private const AMBIGUOUS_MONTHS = ['may', 'mar'];

	private const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
	private const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
	private const COUNTS = [
		'a' => 1, 'an' => 1, 'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5,
		'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10,
	];
	/**
	 * Longer text is not read at all, in characters: a task title is a line,
	 * and the scan must stay quick on whatever a client sends.
	 */
	public const MAX_LENGTH = 1000;
	/** The most words after "at"/"in" a place can have; a longer run is no place. */
	private const MAX_PLACE_WORDS = 8;

	/** The hour a part of the day means on its own. */
	private const PART_HOURS = ['morning' => 9, 'afternoon' => 14, 'evening' => 18, 'tonight' => 18];

	/**
	 * A place phrase ending in one of these is a place. Single words: "post
	 * office" ends in "office".
	 */
	private const PLACE_WORDS = [
		'store', 'shop', 'market', 'supermarket', 'grocery', 'pharmacy', 'drugstore', 'bank',
		'office', 'gym', 'school', 'college', 'university', 'library', 'hospital', 'clinic',
		'doctor', 'dentist', 'vet', 'airport', 'station', 'mall', 'restaurant', 'cafe', 'café',
		'bakery', 'church', 'park', 'garage', 'home', 'work', 'house', 'apartment', 'hotel',
		'salon', 'barber', 'cleaners', 'hardware', 'center', 'studio', 'court', 'field', 'pool',
		'club',
	];
	/** Words that end a place phrase. */
	private const STOP_WORDS = [
		'on', 'by', 'for', 'to', 'in', 'this', 'next', 'before', 'after', 'and', 'then', 'with',
		'today', 'tomorrow', 'tonight',
	];

	/**
	 * @param string $text The task's text as typed
	 * @param DateTimeImmutable $now The current moment
	 * @param DateTimeZone $zone The user's time zone, which decides what "today" is
	 * @param list<string> $ignore Kinds not to read, so their words stay in the
	 *                             title: 'date' (dates and times), 'place'
	 */
	public function parse(string $text, DateTimeImmutable $now, DateTimeZone $zone, array $ignore = []): ParseResult {
		if (!mb_check_encoding($text, 'UTF-8') || mb_strlen($text) > self::MAX_LENGTH) {
			return new ParseResult(trim($text));
		}
		$now = $now->setTimezone($zone);
		$today = $now->setTime(0, 0);
		$taken = [];
		$date = null;
		$time = null;
		$location = null;

		if (!in_array(self::IGNORE_DATE, $ignore, true)) {
			$date = $this->firstMatch($text, $this->dateRules($today), $taken, true);
			if ($date !== null) {
				$taken[] = [$date['start'], $date['end']];
			}
			$time = $this->findTime($text, $taken);
			if ($time !== null) {
				$taken[] = [$time['start'], $time['end']];
			}
		}
		if (!in_array(self::IGNORE_PLACE, $ignore, true)) {
			$location = $this->findPlace($text, $taken);
		}
		if ($date === null && $time === null && $location === null) {
			return new ParseResult(trim($text));
		}

		$title = $this->title($text, array_filter([$date, $time]));
		if ($title === '') {
			// Nothing but a date: there is no task left to name
			return new ParseResult(trim($text));
		}

		$due = null;
		$allDay = false;
		if ($time !== null) {
			$due = ($date['value'] ?? $today)->setTime($time['hour'], $time['minute']);
			// A time on its own is today, or tomorrow once it has passed;
			// "tonight" is always today
			if ($date === null && !$time['today'] && $due < $now) {
				$due = $this->addDays($today, 1)->setTime($time['hour'], $time['minute']);
			}
		} elseif ($date !== null) {
			$due = $date['value']->setTime(0, 0);
			$allDay = true;
		}

		return new ParseResult($title, $due, $allDay, $location, true);
	}

	/**
	 * Date phrases, as [pattern, reader]. A reader returns the date (midnight)
	 * or null when the words do not make one ("8/32").
	 *
	 * @return list<array{string, callable(array): ?DateTimeImmutable}>
	 */
	private function dateRules(DateTimeImmutable $today): array {
		return [
			['/\b' . self::BY . '(today|tomorrow)\b' . self::NOT_POSSESSIVE . '/i',
				fn (array $m) => $this->addDays($today, strtolower($m[1]) === 'tomorrow' ? 1 : 0)],
			// Next week is next Monday
			['/\bnext\s+week\b' . self::NOT_POSSESSIVE . '/i',
				fn (array $m) => $this->addDays($today, (8 - (int)$today->format('w')) % 7 ?: 7)],
			['/\bin\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?)\b/i',
				fn (array $m) => $this->addDays($today, (self::COUNTS[strtolower($m[1])] ?? (int)$m[1])
					* (stripos($m[2], 'week') === 0 ? 7 : 1))],
			// July 3rd, Jul 3 2027, Dec. 21, August 10, 2012
			['/\b' . self::ON . self::MONTH . '\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b' . self::YEAR . '/i',
				fn (array $m) => $this->monthDay($today, $this->month($m[1]), (int)$m[2], $m[3] ?? $m[4])],
			// 3 July, the 3rd of July, 31st March, 2016. "May" and "mar" count only
			// with something that makes them a date: on/by/the/of, an ordinal or a year
			['/\b((?:on|by)\s+)?(the\s+)?(\d{1,2})(st|nd|rd|th)?\s+(of\s+)?' . self::MONTH . '\b' . self::YEAR . '/i',
				fn (array $m) => in_array(strtolower($m[6]), self::AMBIGUOUS_MONTHS, true)
					&& ($m[1] ?? $m[2] ?? $m[4] ?? $m[5] ?? $m[7] ?? $m[8]) === null
					? null
					: $this->monthDay($today, $this->month($m[6]), (int)$m[3], $m[7] ?? $m[8])],
			// on 11/1, by 11/1, 8/10/2012: US month/day. Bare, "1/2" is as likely a fraction
			['/(?<![\/\d])\b((?:on|by)\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b(?![\/\d])/i',
				fn (array $m) => $m[1] === null && $m[4] === null
					? null
					: $this->monthDay($today, (int)$m[2], (int)$m[3], $m[4])],
			// Friday, this Tuesday, next Tuesday
			['/\b' . self::ON . '(?:(next|this)\s+)?' . self::WEEKDAY . '\b' . self::NOT_POSSESSIVE . '/i',
				fn (array $m) => $this->weekday($today, $m[2], $m[1] === null ? null : strtolower($m[1]))],
		];
	}

	/**
	 * Clock times, as [pattern, reader]. A reader returns the hour as written,
	 * the minute, "am"/"pm" if written, and how the time was written.
	 *
	 * @return list<array{string, callable(array): ?array}>
	 */
	private function clockRules(): array {
		return [
			// 10am, at 3:30 pm, 9 p.m.
			['/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i',
				fn (array $m) => $this->clock((int)$m[1], (int)($m[2] ?? 0), stripos($m[3], 'p') === 0 ? 'pm' : 'am', 'meridiem')],
			['/\b(?:at\s+)?noon\b/i',
				fn (array $m) => ['hour' => 12, 'minute' => 0, 'meridiem' => null, 'kind' => 'noon']],
			// at 3, at 19:00, at 4 o'clock; not "at 6.5 kilograms" or "at 3/4"
			['/\bat\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*[:\/])(?![.,]\d)(?:\s+o(?:\'|\xE2\x80\x99)clock\b)?/i',
				fn (array $m) => $this->clock((int)$m[1], (int)($m[2] ?? 0), null, 'at')],
			// A bare number counts only right before a part of the day: "6 in the morning", "11 tonight"
			['/\b(\d{1,2})(?::(\d{2}))?(?=\s+(?:' . self::PART_OF_DAY . ')\b' . self::NOT_POSSESSIVE . ')/i',
				fn (array $m) => $this->clock((int)$m[1], (int)($m[2] ?? 0), null, 'bare')],
		];
	}

	private function clock(int $hour, int $minute, ?string $meridiem, string $kind): ?array {
		$maxHour = $meridiem === null ? 23 : 12;
		$minHour = $meridiem === null ? 0 : 1;
		if ($hour < $minHour || $hour > $maxHour || $minute > 59) {
			return null;
		}
		return ['hour' => $hour, 'minute' => $minute, 'meridiem' => $meridiem, 'kind' => $kind];
	}

	/**
	 * The first time phrase: a clock time, a part of the day, or the two side
	 * by side ("this afternoon at 3", "tonight 8pm", "6 in the morning"), which
	 * read as one phrase.
	 *
	 * @param list<array{int, int}> $taken
	 * @return ?array{start: int, end: int, hour: int, minute: int, today: bool}
	 */
	private function findTime(string $text, array $taken): ?array {
		$clock = $this->firstMatch($text, $this->clockRules(), $taken);
		// "this evening" names today, like "tonight"
		$part = $this->firstMatch($text, [
			['/\b(?:' . self::PART_OF_DAY . ')\b' . self::NOT_POSSESSIVE . '/i', fn (array $m) => [
				'part' => strtolower($m[1] ?? $m[2]),
				'today' => ($m[2] ?? null) !== null || stripos($m[0], 'this') === 0,
			]],
		], $taken, true);

		if ($clock !== null && $part !== null) {
			[$first, $second] = $clock['start'] < $part['start'] ? [$clock, $part] : [$part, $clock];
			$gap = substr($text, $first['end'], $second['start'] - $first['end']);
			if (preg_match('/^\s+$/', $gap) === 1) {
				return $this->time($first['start'], $second['end'], $clock['value'], $part['value']);
			}
		}
		if ($clock !== null && $clock['value']['kind'] === 'bare') {
			// Its part of the day was not the first one; a bare number alone is no time
			$clock = null;
		}
		if ($clock !== null && ($part === null || $clock['start'] < $part['start'])) {
			return $this->time($clock['start'], $clock['end'], $clock['value'], null);
		}
		if ($part !== null) {
			return $this->time($part['start'], $part['end'], null, $part['value']);
		}
		return null;
	}

	/**
	 * @param ?array{part: string, today: bool} $part
	 * @return array{start: int, end: int, hour: int, minute: int, today: bool}
	 */
	private function time(int $start, int $end, ?array $clock, ?array $part): array {
		if ($clock === null) {
			$hour = self::PART_HOURS[$part['part']];
			$minute = 0;
		} else {
			$hour = $this->hour($clock, $part['part'] ?? null);
			$minute = $clock['minute'];
		}
		return ['start' => $start, 'end' => $end, 'hour' => $hour, 'minute' => $minute, 'today' => $part['today'] ?? false];
	}

	/**
	 * The hour on a 24-hour clock. Without am/pm, a part of the day decides
	 * (12 in the evening or tonight is midnight: 24, the start of the next
	 * day); failing that a bare "at 3" means 1–6 PM, 7–11 AM, 12 noon.
	 */
	private function hour(array $clock, ?string $part): int {
		$hour = $clock['hour'];
		if ($clock['meridiem'] !== null) {
			return $hour % 12 + ($clock['meridiem'] === 'pm' ? 12 : 0);
		}
		if ($clock['kind'] === 'noon') {
			return 12;
		}
		if ($part === 'morning') {
			return $hour === 12 ? 0 : $hour;
		}
		if ($part !== null) {
			if ($hour === 12) {
				return $part === 'afternoon' ? 12 : 24;
			}
			return $hour < 12 ? $hour + 12 : $hour;
		}
		return $hour >= 1 && $hour <= 6 ? $hour + 12 : $hour;
	}

	/**
	 * The earliest match of any rule, outside the text already taken. For each
	 * rule only its first usable match counts; on a tie the earlier rule wins.
	 *
	 * @param list<array{string, callable(array): mixed}> $rules
	 * @param list<array{int, int}> $taken
	 * @param bool $notRepeats Skip a match right after "every"/"each": repeat
	 *                         phrases are not read ("Water plants every Monday")
	 * @return ?array{start: int, end: int, value: mixed}
	 */
	private function firstMatch(string $text, array $rules, array $taken, bool $notRepeats = false): ?array {
		$best = null;
		foreach ($rules as [$pattern, $read]) {
			preg_match_all($pattern, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL);
			foreach ($matches as $match) {
				$start = $match[0][1];
				$end = $start + strlen($match[0][0]);
				if ($this->overlaps($start, $end, $taken)
					|| ($notRepeats && preg_match(self::REPEAT, substr($text, 0, $start)) === 1)) {
					continue;
				}
				$value = $read(array_map(static fn (array $group) => $group[0], $match));
				if ($value === null) {
					continue;
				}
				if ($best === null || $start < $best['start']) {
					$best = ['start' => $start, 'end' => $end, 'value' => $value];
				}
				break;
			}
		}
		return $best;
	}

	/**
	 * A place, only when sure: "at" or "in" followed by words, up to the end, a
	 * date or time phrase, punctuation or a stop word, when the words end in a
	 * place word ("the grocery store"), are a short possessive ("Mom's"), or are
	 * a capitalized name right after a place word ("the shop at Seville"). More
	 * than MAX_PLACE_WORDS words is no place. A phrase that runs into another
	 * "at" leaves the place to that one ("Fill in the form at the bank" → bank;
	 * "in" is a stop word, so it ends a phrase instead).
	 *
	 * The text is split into words once; each "at"/"in" looks at a few of them.
	 *
	 * @param list<array{int, int}> $taken
	 */
	private function findPlace(string $text, array $taken): ?string {
		preg_match_all('/\b(?:at|in)\s+/i', $text, $starts, PREG_OFFSET_CAPTURE);
		preg_match_all('/\S+/u', $text, $words, PREG_OFFSET_CAPTURE);
		$words = $words[0];
		$count = count($words);
		$next = 0;
		foreach ($starts[0] as [$lead, $start]) {
			if ($this->inside($start, $taken)) {
				continue;
			}
			$first = $start + strlen($lead);
			// The starts come in order, so the first word after each only moves on
			while ($next < $count && $words[$next][1] < $first) {
				$next++;
			}
			$phrase = [];
			$end = $first;
			$open = true;
			$inner = false;
			for ($i = $next; $i < $count; $i++) {
				[$word, $offset] = $words[$i];
				if ($this->inside($offset, $taken) || in_array($this->bare($word), self::STOP_WORDS, true)) {
					$open = false;
					break;
				}
				if ($this->bare($word) === 'at') {
					// "Check in at the hotel", "the form at the bank": the
					// inner "at" decides
					$inner = true;
					break;
				}
				$trimmed = rtrim($word, '.,;:!?');
				if ($trimmed === '') {
					$open = false;
					break;
				}
				if (count($phrase) === self::MAX_PLACE_WORDS) {
					break;
				}
				$phrase[] = $trimmed;
				$end = $offset + strlen($trimmed);
				if ($trimmed !== $word) {
					$open = false;
					break;
				}
			}
			if ($inner || ($open && $i < $count)) {
				// Still going after MAX_PLACE_WORDS words
				continue;
			}
			if ($phrase !== [] && $this->isSurePlace($phrase, $this->wordBefore($text, $start, $words, $next))) {
				return preg_replace('/^(?:the|my|a)\s+/i', '', substr($text, $first, $end - $first));
			}
		}
		return null;
	}

	/**
	 * The last word before byte offset $start (where "at"/"in" begins), as the
	 * text up to there would end: a word that runs into "at" ("shop(at") counts
	 * only up to it.
	 *
	 * @param list<array{string, int}> $words Every word of the text, in order
	 * @param int $after The index of the first word after "at"/"in"
	 */
	private function wordBefore(string $text, int $start, array $words, int $after): string {
		for ($i = min($after, count($words)) - 1; $i >= 0; $i--) {
			[$word, $offset] = $words[$i];
			if ($offset >= $start) {
				continue;
			}
			$part = rtrim(substr($word, 0, $start - $offset));
			if ($part !== '') {
				return $part;
			}
		}
		return '';
	}

	/**
	 * @param non-empty-list<string> $phrase The words after "at"/"in"
	 * @param string $previous The word before "at"/"in"
	 */
	private function isSurePlace(array $phrase, string $previous): bool {
		$last = str_replace("\u{2019}", "'", mb_strtolower($phrase[count($phrase) - 1]));
		$possessive = preg_match("/'s$/", $last) === 1;
		if (in_array($last, self::PLACE_WORDS, true)
			|| ($possessive && in_array(substr($last, 0, -2), self::PLACE_WORDS, true))) {
			return true;
		}
		if ($possessive && count($phrase) <= 2) {
			return true;
		}
		$previous = preg_replace('/[^a-z]/', '', strtolower($previous));
		return in_array($previous, self::PLACE_WORDS, true) && preg_match('/^[A-Z]/', $phrase[0]) === 1;
	}

	/**
	 * The title: the text without the date and time phrases, without a leading
	 * "Remind me to", capitalized if the text was. Cleanup happens only where a
	 * phrase was cut out; the rest of the text stays exactly as typed.
	 *
	 * @param list<array{start: int, end: int}> $spans
	 */
	private function title(string $text, array $spans): string {
		$title = $text;
		usort($spans, static fn (array $a, array $b) => $b['start'] <=> $a['start']);
		foreach ($spans as $span) {
			$removed = substr($text, $span['start'], $span['end'] - $span['start']);
			$title = $this->join(substr($title, 0, $span['start']), substr($title, $span['end']), $removed);
		}
		$title = preg_replace('/^remind\s+me\s+to\s+/i', '', trim($title));
		if (preg_match('/^[A-Z]/', trim($text)) === 1) {
			$title = ucfirst($title);
		}
		return $title;
	}

	/**
	 * Joins the text on either side of a removed phrase, tidying only what the
	 * removal left at the seam.
	 *
	 * @param string $removed The phrase removed between them
	 */
	private function join(string $left, string $right, string $removed): string {
		if (preg_match('/([(\[{])\s*$/', $left, $open) === 1
			&& preg_match('/^\s*' . preg_quote(['(' => ')', '[' => ']', '{' => '}'][$open[1]], '/') . '/', $right, $close) === 1) {
			// The phrase filled a bracket: "Dentist (tomorrow)" → "Dentist"
			$left = substr($left, 0, -strlen($open[0]));
			$right = substr($right, strlen($close[0]));
		}
		$edge = '/^[\s[:punct:]]*$/';
		if (preg_match($edge, $left) === 1) {
			// The phrase opened the text: "Tomorrow, bring…" → "bring…"
			return preg_replace('/^\s*(?:[,.;:\x{2013}\x{2014}-]+(?=\s|$))?\s*/u', '', $right);
		}
		if (preg_match($edge, $right) === 1) {
			// The phrase closed the text: drop a dangling separator, and a dangling
			// "by" when the phrase brought no preposition of its own ("Finish by
			// tonight"). Every phrase that takes "on" or "at" carries it, so one
			// left behind is a verb's ("Log on tomorrow", "Stop by at 6"). Keep
			// closing punctuation ("…something in 5 days." → "…something.")
			$left = preg_replace('/(?:[\s,;:\x{2013}\x{2014}]|(?<=\s)-)+$/u', '', $left);
			if (preg_match('/^(?:on|at|by)\s/i', $removed) !== 1) {
				$left = preg_replace('/\s+by$/i', '', $left);
			}
			$left = rtrim($left);
			return $left . preg_replace('/^[\s,;:\x{2013}\x{2014}-]+/u', '', $right);
		}
		$left = rtrim($left);
		$right = ltrim($right);
		if (preg_match('/[,;:]$/', $left) === 1 && preg_match('/^[,;:]+(?=\s|$)/', $right) === 1) {
			// "Call Sam, tomorrow, then lunch" → "Call Sam, then lunch"
			return $left . ' ' . ltrim(preg_replace('/^[,;:]+/', '', $right));
		}
		// Punctuation that belonged to the previous word goes back onto it
		return preg_match('/^[,.!?;:](?=\s|$)/', $right) === 1 ? $left . $right : $left . ' ' . $right;
	}

	/**
	 * A month and day; with no year, the next one from today on ("July 3"
	 * after July 3 is next year's). Null when there is no such date.
	 */
	private function monthDay(DateTimeImmutable $today, int $month, int $day, ?string $year): ?DateTimeImmutable {
		if ($year !== null) {
			$fullYear = strlen($year) === 2 ? 2000 + (int)$year : (int)$year;
			return checkdate($month, $day, $fullYear) ? $today->setDate($fullYear, $month, $day) : null;
		}
		$thisYear = (int)$today->format('Y');
		foreach ([$thisYear, $thisYear + 1] as $candidate) {
			if (checkdate($month, $day, $candidate)) {
				$date = $today->setDate($candidate, $month, $day);
				if ($date >= $today) {
					return $date;
				}
			}
		}
		return null;
	}

	/**
	 * The coming weekday: "Monday" on a Monday is next week's, "this Monday"
	 * on a Monday is today, "next" adds a week to anything before then.
	 */
	private function weekday(DateTimeImmutable $today, string $name, ?string $which): DateTimeImmutable {
		$want = array_search(strtolower(substr($name, 0, 3)), self::WEEKDAYS, true);
		$days = ($want - (int)$today->format('w') + 7) % 7;
		if ($days === 0 && $which !== 'this') {
			$days = 7;
		}
		if ($which === 'next' && $days < 7) {
			$days += 7;
		}
		return $this->addDays($today, $days);
	}

	private function month(string $name): int {
		return array_search(strtolower(substr($name, 0, 3)), self::MONTHS, true) + 1;
	}

	/** Counted on the calendar, so midnight stays midnight across a clock change. */
	private function addDays(DateTimeImmutable $day, int $days): DateTimeImmutable {
		return $day->setDate((int)$day->format('Y'), (int)$day->format('n'), (int)$day->format('j') + $days);
	}

	/** A word as compared with the stop words: lowercase letters, digits and apostrophes. */
	private function bare(string $word): string {
		return preg_replace("/[^a-z0-9']/", '', str_replace("\u{2019}", "'", strtolower($word)));
	}

	/** @param list<array{int, int}> $taken */
	private function inside(int $offset, array $taken): bool {
		foreach ($taken as [$start, $end]) {
			if ($offset >= $start && $offset < $end) {
				return true;
			}
		}
		return false;
	}

	/** @param list<array{int, int}> $taken */
	private function overlaps(int $start, int $end, array $taken): bool {
		foreach ($taken as [$takenStart, $takenEnd]) {
			if ($start < $takenEnd && $end > $takenStart) {
				return true;
			}
		}
		return false;
	}
}
