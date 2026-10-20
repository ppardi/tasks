<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Tests\NaturalLanguage;

use DateTimeImmutable;
use DateTimeZone;
use OCA\Tasks\NaturalLanguage\Parser;
use OCA\Tasks\NaturalLanguage\ParseResult;
use PHPUnit\Framework\TestCase;

/**
 * "Now" is Wednesday 21 October 2026, 2:30 PM in Phoenix (UTC-7, no daylight
 * saving) unless a test says otherwise. Expected due dates are local: 'Y-m-d'
 * for an all-day date, 'Y-m-d H:i' for a date with a time.
 */
class ParserTest extends TestCase {
	private DateTimeZone $zone;
	private DateTimeImmutable $now;
	private Parser $parser;

	protected function setUp(): void {
		$this->zone = new DateTimeZone('America/Phoenix');
		$this->now = new DateTimeImmutable('2026-10-21 14:30', $this->zone);
		$this->parser = new Parser();
	}

	private function parse(string $text, array $ignore = []): ParseResult {
		return $this->parser->parse($text, $this->now, $this->zone, $ignore);
	}

	private function assertParsed(ParseResult $result, string $input, string $title, ?string $due, ?string $location): void {
		$this->assertSame($title, $result->title, 'title');
		$this->assertSame($location, $result->location, 'location');
		if ($due === null) {
			$this->assertNull($result->due, 'due');
			$this->assertFalse($result->allDay, 'allDay');
		} else {
			$this->assertNotNull($result->due, 'due');
			$this->assertSame($this->zone->getName(), $result->due->getTimezone()->getName(), 'due zone');
			$allDay = strlen($due) === 10;
			$this->assertSame($due, $result->due->format($allDay ? 'Y-m-d' : 'Y-m-d H:i'), 'due');
			$this->assertSame($allDay, $result->allDay, 'allDay');
			if ($allDay) {
				$this->assertSame('00:00:00', $result->due->format('H:i:s'), 'all-day due is midnight');
			}
		}
		$found = $due !== null || $location !== null;
		$this->assertSame($found, $result->found, 'found');
		if (!$found) {
			$this->assertSame(trim($input), $result->title, 'nothing found leaves the text as typed');
		}
	}

	public function phrases(): array {
		$rows = [
			// The design's examples
			['Purchase milk at the grocery store tomorrow evening', 'Purchase milk at the grocery store', '2026-10-22 18:00', 'grocery store'],
			['Tomorrow at 10am, bring flowers to the shop at Seville', 'Bring flowers to the shop at Seville', '2026-10-22 10:00', 'Seville'],
			['Take Aidan to the doctor on July 3rd at 10am', 'Take Aidan to the doctor', '2027-07-03 10:00', null],
			['Call the bank Friday afternoon', 'Call the bank', '2026-10-23 14:00', null],
			['By Friday finish the report', 'Finish the report', '2026-10-23', null],
			['Pay rent by 11/1', 'Pay rent', '2026-11-01', null],
			["Dinner at Mom's Sunday evening", "Dinner at Mom's", '2026-10-25 18:00', "Mom's"],
			["Dinner at Mom\u{2019}s Sunday evening", "Dinner at Mom\u{2019}s", '2026-10-25 18:00', "Mom\u{2019}s"],
			['Stop in the garage tomorrow', 'Stop in the garage', '2026-10-22', 'garage'],
			// Times: a time with no date is today, or tomorrow once it has passed
			['Pick up dry cleaning tonight', 'Pick up dry cleaning', '2026-10-21 18:00', null],
			['Dentist at 3', 'Dentist', '2026-10-21 15:00', null],
			['Dentist at 2', 'Dentist', '2026-10-22 14:00', null],
			['Call Mom today at 8am', 'Call Mom', '2026-10-21 08:00', null],
			['Dentist at noon', 'Dentist', '2026-10-22 12:00', null],
			// Weekdays and counted dates; "now" is a Wednesday
			['Water plants Wednesday', 'Water plants', '2026-10-28', null],
			['Water plants this Wednesday', 'Water plants', '2026-10-21', null],
			['Water plants next Tuesday', 'Water plants', '2026-11-03', null],
			['Water plants in 3 days', 'Water plants', '2026-10-24', null],
			['Water plants in a week', 'Water plants', '2026-10-28', null],
			['Water plants next week', 'Water plants', '2026-10-26', null],
			// "Remind me to" goes only when something else was read
			['Remind me to buy milk tomorrow', 'Buy milk', '2026-10-22', null],
			['Remind me to look at the GEX Project', 'Remind me to look at the GEX Project', null, null],
			// Places only when sure
			['Meet Sam at Starbucks tomorrow', 'Meet Sam at Starbucks', '2026-10-22', null],
			['Keep this in mind', 'Keep this in mind', null, null],
			// Only the first date phrase is read
			['Call Mom Friday or Saturday', 'Call Mom or Saturday', '2026-10-23', null],
			// Removal that leaves nothing is no parse
			['Tomorrow', 'Tomorrow', null, null],
			['Plan #work trip tomorrow', 'Plan #work trip', '2026-10-22', null],
			// Review fixes: a bare numeric date needs "on"/"by" or a year
			['Buy 1/2 gallon of milk', 'Buy 1/2 gallon of milk', null, null],
			// Cleanup touches only the ends a removed phrase reached
			['Friday: figure out what to work on', 'Figure out what to work on', '2026-10-23', null],
			['Tomorrow, decide what to look at', 'Decide what to look at', '2026-10-22', null],
			['.NET upgrade tomorrow', '.NET upgrade', '2026-10-22', null],
			['Use the .NET SDK tomorrow', 'Use the .NET SDK', '2026-10-22', null],
			// A possessive is not a date
			["Prepare tomorrow's agenda", "Prepare tomorrow's agenda", null, null],
			["Prepare tomorrow\u{2019}s agenda", "Prepare tomorrow\u{2019}s agenda", null, null],
			["Review Friday's notes", "Review Friday's notes", null, null],
			["Review Friday\u{2019}s notes", "Review Friday\u{2019}s notes", null, null],
			["Read this morning's mail", "Read this morning's mail", null, null],
			// Short day names that are everyday words are not days
			["C'mon, finish it", "C'mon, finish it", null, null],
			['Get wed in June', 'Get wed in June', null, null],
			// 12 in the evening is midnight, the start of the next day
			['Call Sam tonight at 12', 'Call Sam', '2026-10-22 00:00', null],
			// "May" before a month day needs on/by/the/of, an ordinal or a year
			['Print 2 May flyers', 'Print 2 May flyers', null, null],
			['Call Sam on 2 May', 'Call Sam', '2027-05-02', null],
			['Book the hall 2 May 2027', 'Book the hall', '2027-05-02', null],
			// A year only where a year can end: not "Jan 5 2000 units"
			['Order on Jan 5 2000 units', 'Order 2000 units', '2027-01-05', null],
		];
		$named = [];
		foreach ($rows as $row) {
			$named[$row[0]] = $row;
		}
		return $named;
	}

	/**
	 * @dataProvider phrases
	 */
	public function testPhrase(string $input, string $title, ?string $due, ?string $location): void {
		$this->assertParsed($this->parse($input), $input, $title, $due, $location);
	}

	public function chronoPhrases(): array {
		$named = [];
		foreach (require __DIR__ . '/chrono-en-phrases.php' as $row) {
			$named[$row[0]] = $row;
		}
		return $named;
	}

	/**
	 * Phrases from chrono-node's English tests, read under our rules.
	 *
	 * @dataProvider chronoPhrases
	 */
	public function testChronoPhrases(string $input, string $title, ?string $due, ?string $location): void {
		$this->assertParsed($this->parse($input), $input, $title, $due, $location);
	}

	public function testIgnoringThePlaceKeepsTheDate(): void {
		$input = 'Purchase milk at the grocery store tomorrow evening';
		$this->assertParsed($this->parse($input, ['place']), $input, 'Purchase milk at the grocery store', '2026-10-22 18:00', null);
	}

	public function testIgnoringTheDateLeavesItsWordsInTheTitle(): void {
		$input = 'Purchase milk at the grocery store tomorrow evening';
		$this->assertParsed($this->parse($input, ['date']), $input, $input, null, 'grocery store');
	}

	public function testIgnoringBothIsNoParse(): void {
		$input = 'Remind me to stop at the bank tomorrow';
		$this->assertParsed($this->parse($input, ['date', 'place']), $input, $input, null, null);
	}

	public function testAnExplicitDateIsNotMovedLateAtNight(): void {
		$this->now = new DateTimeImmutable('2026-10-21 23:30', $this->zone);
		$input = 'Run tomorrow at 9am';
		$this->assertParsed($this->parse($input), $input, 'Run', '2026-10-22 09:00', null);
	}

	public function testTomorrowAcrossTheEndOfDaylightSaving(): void {
		// New York leaves daylight saving at 2 AM on Sunday 1 November 2026
		$this->zone = new DateTimeZone('America/New_York');
		$this->now = new DateTimeImmutable('2026-10-31 12:00', $this->zone);
		$input = 'Run tomorrow 9am';
		$result = $this->parse($input);
		$this->assertParsed($result, $input, 'Run', '2026-11-01 09:00', null);
		$this->assertSame('-05:00', $result->due->format('P'));
	}

	public function testNowInAnotherZoneIsReadInTheUsersZone(): void {
		// 02:00 UTC on the 22nd is still 7:00 PM on the 21st in Phoenix
		$this->now = new DateTimeImmutable('2026-10-22 02:00', new DateTimeZone('UTC'));
		$input = 'Call Mom today';
		$this->assertParsed($this->parse($input), $input, 'Call Mom', '2026-10-21', null);
	}

	public function testAllDayToArrayIsMidnightWhereMidnightDoesNotExist(): void {
		// Santiago skips from midnight to 1 AM on Sunday 6 September 2026
		$this->zone = new DateTimeZone('America/Santiago');
		$this->now = new DateTimeImmutable('2026-09-06 12:00', $this->zone);
		$result = $this->parse('Run today')->toArray();
		$this->assertSame('2026-09-06T00:00:00', $result['due']);
		$this->assertTrue($result['allDay']);
	}

	public function testInvalidUtf8IsNoParse(): void {
		$input = "Call Mom tomorrow \xC3";
		$result = $this->parse($input);
		$this->assertFalse($result->found);
		$this->assertSame($input, $result->title);
	}

	public function testTextLongerThanTheCapIsNoParse(): void {
		$input = str_pad('Buy milk at the grocery store tomorrow ', 1001, 'x');
		$this->assertSame(1001, mb_strlen($input));
		$result = $this->parse($input);
		$this->assertFalse($result->found);
		$this->assertSame(trim($input), $result->title);
	}

	public function testTextAtTheCapIsParsed(): void {
		// Counted in characters, not bytes: 1000 of them, most two bytes long
		$input = 'Buy milk at the grocery store tomorrow ' . str_repeat('é', 1000 - 39);
		$this->assertSame(1000, mb_strlen($input));
		$this->assertTrue($this->parse($input)->found);
	}

	public function testManyAtsAndInsAreQuick(): void {
		$input = str_repeat('in x ', 20 * 1024);
		$started = microtime(true);
		$result = $this->parse($input);
		$this->assertLessThan(1.0, microtime(true) - $started, 'seconds');
		$this->assertFalse($result->found);
	}

	public function placeLengths(): array {
		return [
			'eight words: a place' => ['Meet at the very big old red brick community center', 'very big old red brick community center'],
			'nine words: too long to be sure' => ['Meet at the very big old red brick community health center', null],
			'a short place after a long run of words' => ['one two three four five six seven eight nine ten at the bank', 'bank'],
		];
	}

	/**
	 * @dataProvider placeLengths
	 */
	public function testAPlaceIsAFewWords(string $input, ?string $location): void {
		$after = count(preg_split('/\s+/', explode(' at ', $input, 2)[1]));
		$this->assertContains($after, [8, 9, 2], 'words after "at"');
		$this->assertParsed($this->parse($input), $input, trim($input), null, $location);
	}

	public function testANameAfterAPlaceWordReadsTheWordJustBefore(): void {
		// The second "at" follows the place word "cafe"
		$this->assertParsed($this->parse('Lunch at the cafe at Seville'), 'Lunch at the cafe at Seville', 'Lunch at the cafe at Seville', null, 'Seville');
		$this->assertParsed($this->parse('Meet by the shop at Seville'), 'Meet by the shop at Seville', 'Meet by the shop at Seville', null, 'Seville');
	}

	public function testToArray(): void {
		$this->assertSame([
			'title' => 'Purchase milk at the grocery store',
			'due' => '2026-10-22T18:00:00',
			'allDay' => false,
			'location' => 'grocery store',
			'found' => true,
		], $this->parse('Purchase milk at the grocery store tomorrow evening')->toArray());
		$this->assertSame([
			'title' => 'Stop in the garage',
			'due' => '2026-10-22T00:00:00',
			'allDay' => true,
			'location' => 'garage',
			'found' => true,
		], $this->parse('Stop in the garage tomorrow')->toArray());
		$this->assertSame([
			'title' => 'Keep this in mind',
			'due' => null,
			'allDay' => false,
			'location' => null,
			'found' => false,
		], $this->parse('  Keep this in mind ')->toArray());
	}
}
