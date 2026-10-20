<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Tests\NaturalLanguage;

use DateTimeImmutable;
use DateTimeZone;
use OCA\Tasks\NaturalLanguage\ArrivalParser;
use PHPUnit\Framework\TestCase;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

/**
 * "Now" is Wednesday 21 October 2026, 2:30 PM in Phoenix (UTC-7, no daylight
 * saving), which is 21:30Z. Tomorrow at 6:00 PM local is 20261023T010000Z.
 */
class ArrivalParserTest extends TestCase {
	private const NOW_UTC = '20261021T213000Z';
	private const TWO_DAYS_AGO = '20261019T213000Z';

	private DateTimeZone $zone;
	private DateTimeImmutable $now;
	private ArrivalParser $arrival;

	protected function setUp(): void {
		$this->zone = new DateTimeZone('America/Phoenix');
		$this->now = new DateTimeImmutable('2026-10-21 14:30', $this->zone);
		$this->arrival = new ArrivalParser();
	}

	/**
	 * A calendar object holding one VTODO with these lines; DTSTAMP is now
	 * unless a line sets it.
	 */
	private function task(string ...$lines): VCalendar {
		$stamped = array_filter($lines, static fn (string $line): bool => str_starts_with($line, 'DTSTAMP'));
		$head = ['UID:t1'];
		if (!$stamped) {
			$head[] = 'DTSTAMP:' . self::NOW_UTC;
		}
		return $this->object("BEGIN:VTODO\r\n" . implode("\r\n", [...$head, ...$lines]) . "\r\nEND:VTODO");
	}

	private function object(string $components): VCalendar {
		$ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n$components\r\nEND:VCALENDAR\r\n";
		/** @var VCalendar */
		return Reader::read($ics);
	}

	private function apply(VCalendar $calendar): bool {
		return $this->arrival->apply($calendar, $this->zone, $this->now);
	}

	/**
	 * @return list<string> Each VALARM's TRIGGER, asserting it is a tagged automatic reminder
	 */
	private function automaticTriggers(VCalendar $calendar): array {
		$triggers = [];
		foreach ($calendar->VTODO->select('VALARM') as $alarm) {
			$this->assertSame('DISPLAY', (string)$alarm->ACTION);
			$this->assertSame('Reminder', (string)$alarm->DESCRIPTION);
			$this->assertSame('DATE-TIME', (string)$alarm->TRIGGER['VALUE']);
			$this->assertSame('1', (string)$alarm->{ArrivalParser::AUTOMATIC});
			$triggers[] = (string)$alarm->TRIGGER;
		}
		return $triggers;
	}

	private function assertUnchanged(VCalendar $calendar): void {
		$before = $calendar->serialize();
		$this->assertFalse($this->apply($calendar));
		$this->assertSame($before, $calendar->serialize());
	}

	public function testBareSentenceIsFilledIn(): void {
		$input = 'Purchase milk at the grocery store tomorrow evening';
		$calendar = $this->task("SUMMARY:$input");
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('Purchase milk at the grocery store', (string)$todo->SUMMARY);
		$this->assertSame('20261023T010000Z', (string)$todo->DUE);
		$this->assertTrue($todo->DUE->hasTime());
		$this->assertSame('grocery store', (string)$todo->LOCATION);
		$this->assertSame(['20261023T010000Z'], $this->automaticTriggers($calendar));
		$this->assertSame($input, (string)$todo->{ArrivalParser::ORIGINAL_SUMMARY});
		$this->assertSame('DUE,LOCATION', (string)$todo->{ArrivalParser::FILLED});
		// The arrival is not an edit: nothing else is touched
		$this->assertSame(self::NOW_UTC, (string)$todo->DTSTAMP);
		$this->assertFalse(isset($todo->{'LAST-MODIFIED'}));
	}

	/**
	 * The web app reads the marks with ical.js, which leaves an X- property's
	 * escapes in place unless it says VALUE=TEXT: the list goes unescaped, the
	 * sentence says what it is.
	 */
	public function testMarksAreWrittenForIcalJs(): void {
		$calendar = $this->task('SUMMARY:Buy milk\, eggs at the grocery store tomorrow evening');
		$this->assertTrue($this->apply($calendar));
		$ics = str_replace("\r\n ", '', $calendar->serialize());
		$this->assertStringContainsString("\r\nX-NEXTCLOUD-TASKS-FILLED:DUE,LOCATION\r\n", $ics);
		$this->assertStringContainsString("\r\nX-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:Buy milk\\, eggs at the grocery store tomorrow evening\r\n", $ics);
	}

	public function testMarksCopiedFromAnotherTaskAreReplaced(): void {
		$calendar = $this->task(
			'SUMMARY:Pay rent tomorrow',
			ArrivalParser::ORIGINAL_SUMMARY . ':Something else',
			ArrivalParser::FILLED . ':LOCATION',
		);
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertCount(1, $todo->select(ArrivalParser::ORIGINAL_SUMMARY));
		$this->assertCount(1, $todo->select(ArrivalParser::FILLED));
		$this->assertSame('Pay rent tomorrow', (string)$todo->{ArrivalParser::ORIGINAL_SUMMARY});
		$this->assertSame('DUE', (string)$todo->{ArrivalParser::FILLED});

		// Only a reminder added: a copied FILLED still goes
		$calendar = $this->task('SUMMARY:Pay rent', 'DUE:20261023T010000Z', ArrivalParser::FILLED . ':LOCATION');
		$this->assertTrue($this->apply($calendar));
		$this->assertFalse(isset($calendar->VTODO->{ArrivalParser::FILLED}));
	}

	public function testAllDayDateRemindsAtNineInTheMorning(): void {
		$calendar = $this->task('SUMMARY:Stop in the garage tomorrow');
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('20261022', (string)$todo->DUE);
		$this->assertSame('DATE', (string)$todo->DUE['VALUE']);
		$this->assertFalse($todo->DUE->hasTime());
		$this->assertSame(['20261022T160000Z'], $this->automaticTriggers($calendar));
	}

	public function testPassedReminderIsNotAdded(): void {
		$calendar = $this->task('SUMMARY:Call Mom today at 8am');
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('Call Mom', (string)$todo->SUMMARY);
		$this->assertSame('20261021T150000Z', (string)$todo->DUE);
		$this->assertSame([], $this->automaticTriggers($calendar));
		$this->assertSame('DUE', (string)$todo->{ArrivalParser::FILLED});
	}

	public function testExistingLocationIsKept(): void {
		$calendar = $this->task('SUMMARY:Purchase milk at the grocery store tomorrow evening', 'LOCATION:Safeway');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('Safeway', (string)$calendar->VTODO->LOCATION);
		$this->assertSame('DUE', (string)$calendar->VTODO->{ArrivalParser::FILLED});
	}

	public function testEmptyLocationIsFilled(): void {
		$calendar = $this->task('SUMMARY:Buy stamps at the post office', 'LOCATION:');
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('Buy stamps at the post office', (string)$todo->SUMMARY);
		$this->assertSame('post office', (string)$todo->LOCATION);
		$this->assertCount(1, $todo->select('LOCATION'));
		$this->assertFalse(isset($todo->DUE));
		$this->assertSame('LOCATION', (string)$todo->{ArrivalParser::FILLED});
	}

	public function testPlaceAlreadyGivenIsNothingToAdd(): void {
		$this->assertUnchanged($this->task('SUMMARY:Buy stamps at the post office', 'LOCATION:Main St'));
	}

	public function testDatedArrivalGetsReminderAndPlace(): void {
		$calendar = $this->task('SUMMARY:Buy milk at the grocery store', 'DUE:20261023T010000Z');
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('Buy milk at the grocery store', (string)$todo->SUMMARY);
		$this->assertSame('20261023T010000Z', (string)$todo->DUE);
		$this->assertSame('grocery store', (string)$todo->LOCATION);
		$this->assertSame(['20261023T010000Z'], $this->automaticTriggers($calendar));
		$this->assertSame('Buy milk at the grocery store', (string)$todo->{ArrivalParser::ORIGINAL_SUMMARY});
		$this->assertSame('LOCATION', (string)$todo->{ArrivalParser::FILLED});
	}

	public function testDatedArrivalReadsNoDateFromItsTitle(): void {
		$calendar = $this->task('SUMMARY:Call Mom tomorrow at 3', 'DUE:20261023T010000Z');
		$this->assertTrue($this->apply($calendar));
		$todo = $calendar->VTODO;
		$this->assertSame('Call Mom tomorrow at 3', (string)$todo->SUMMARY);
		$this->assertSame('20261023T010000Z', (string)$todo->DUE);
		$this->assertSame(['20261023T010000Z'], $this->automaticTriggers($calendar));
		$this->assertFalse(isset($todo->LOCATION));
		// Only the reminder was added: no FILLED mark
		$this->assertFalse(isset($todo->{ArrivalParser::FILLED}));
	}

	public function testAgentMidnightDueRemindsAtNine(): void {
		// Midnight in Phoenix on the 23rd
		$calendar = $this->task('SUMMARY:Pay rent', 'DUE:20261023T070000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame(['20261023T160000Z'], $this->automaticTriggers($calendar));
		$this->assertSame('20261023T070000Z', (string)$calendar->VTODO->DUE);
		$this->assertSame('Pay rent', (string)$calendar->VTODO->{ArrivalParser::ORIGINAL_SUMMARY});
		$this->assertFalse(isset($calendar->VTODO->{ArrivalParser::FILLED}));
	}

	public function testDatedArrivalAllDayAndFloatingDues(): void {
		$calendar = $this->task('SUMMARY:Pay rent', 'DUE;VALUE=DATE:20261023');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame(['20261023T160000Z'], $this->automaticTriggers($calendar));
		$this->assertFalse(isset($calendar->VTODO->{ArrivalParser::FILLED}));

		// Floating is the user's wall clock: 6:00 PM Phoenix
		$calendar = $this->task('SUMMARY:Pay rent', 'DUE:20261022T180000');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame(['20261023T010000Z'], $this->automaticTriggers($calendar));
		$this->assertFalse(isset($calendar->VTODO->{ArrivalParser::FILLED}));
	}

	public function testDatedArrivalInAnUnknownZoneGetsNoGuessedReminder(): void {
		$calendar = $this->task('SUMMARY:Buy milk at the grocery store', 'DUE;TZID=Nowhere/Special:20261022T180000');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame([], $this->automaticTriggers($calendar));
		$this->assertSame('grocery store', (string)$calendar->VTODO->LOCATION);

		$this->assertUnchanged($this->task('SUMMARY:Pay rent', 'DUE;TZID=Nowhere/Special:20261022T180000'));
	}

	public function testDatedArrivalWithNothingToAddIsLeftAlone(): void {
		$this->assertUnchanged($this->task('SUMMARY:Renew passport', 'DUE:20261020T230000Z'));
	}

	/**
	 * @return array<string, array{VCalendar}>
	 */
	public function untouchedProvider(): array {
		$sentence = 'SUMMARY:Purchase milk at the grocery store tomorrow evening';
		$todo = "BEGIN:VTODO\r\nUID:t1\r\nDTSTAMP:" . self::NOW_UTC . "\r\n$sentence\r\nEND:VTODO";
		return [
			'DTSTART' => [$this->task($sentence, 'DTSTART:20261021T230000Z')],
			'VALARM' => [$this->task($sentence, "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nTRIGGER;VALUE=DATE-TIME:20261022T160000Z\r\nEND:VALARM")],
			'RRULE' => [$this->task($sentence, 'DUE:20261022T230000Z', 'RRULE:FREQ=DAILY')],
			'RRULE without DUE' => [$this->task($sentence, 'RRULE:FREQ=DAILY')],
			'completed' => [$this->task($sentence, 'STATUS:COMPLETED')],
			'cancelled' => [$this->task($sentence, 'STATUS:CANCELLED')],
			'COMPLETED date' => [$this->task($sentence, 'COMPLETED:20261021T210000Z')],
			'RECURRENCE-ID' => [$this->task($sentence, 'RECURRENCE-ID:20261022T230000Z')],
			'two VTODOs' => [$this->object($todo . "\r\n" . str_replace('UID:t1', 'UID:t2', $todo))],
			'a VEVENT' => [$this->object("BEGIN:VEVENT\r\nUID:e1\r\nDTSTAMP:" . self::NOW_UTC . "\r\n$sentence\r\nEND:VEVENT")],
			'a VTODO beside a VEVENT' => [$this->object($todo . "\r\nBEGIN:VEVENT\r\nUID:e1\r\nDTSTAMP:" . self::NOW_UTC . "\r\nSUMMARY:x\r\nEND:VEVENT")],
			'CREATED two days ago' => [$this->task($sentence, 'CREATED:' . self::TWO_DAYS_AGO)],
			'no CREATED, DTSTAMP two days ago' => [$this->task($sentence, 'DTSTAMP:' . self::TWO_DAYS_AGO)],
			'CREATED eleven minutes ahead' => [$this->task($sentence, 'CREATED:20261021T214100Z')],
			'no CREATED, no DTSTAMP' => [$this->object("BEGIN:VTODO\r\nUID:t1\r\n$sentence\r\nEND:VTODO")],
			'nothing found' => [$this->task('SUMMARY:Renew passport')],
			'no SUMMARY' => [$this->task('DESCRIPTION:Purchase milk tomorrow')],
		];
	}

	/**
	 * @dataProvider untouchedProvider
	 */
	public function testLeftAlone(VCalendar $calendar): void {
		$this->assertUnchanged($calendar);
	}

	public function testCreatedWithinTenMinutesEitherSideIsParsed(): void {
		// CREATED decides even when DTSTAMP is old
		foreach (['20261021T212500Z', '20261021T213500Z', '20261021T214000Z'] as $created) {
			$calendar = $this->task('SUMMARY:Stop in the garage tomorrow', "CREATED:$created", 'DTSTAMP:' . self::TWO_DAYS_AGO);
			$this->assertTrue($this->apply($calendar), $created);
			$this->assertSame('20261022', (string)$calendar->VTODO->DUE, $created);
		}
	}

	public function testEscapedCharactersSurviveTheRoundTrip(): void {
		$calendar = $this->task('SUMMARY:Buy milk\, eggs\; bread \\\\ jam tomorrow');
		$this->assertTrue($this->apply($calendar));
		/** @var VCalendar $reread */
		$reread = Reader::read($calendar->serialize());
		$this->assertSame('Buy milk, eggs; bread \\ jam', (string)$reread->VTODO->SUMMARY);
		$this->assertSame('Buy milk, eggs; bread \\ jam tomorrow', (string)$reread->VTODO->{ArrivalParser::ORIGINAL_SUMMARY});
		$this->assertSame('DUE', (string)$reread->VTODO->{ArrivalParser::FILLED});
	}

	public function testUnescapedCommaFromASloppyClientIsReadAsText(): void {
		// A client that forgets to escape a comma: sabre splits the value there,
		// and its getValue() then hands back the escaped text ("eggs\; bread")
		$calendar = $this->task('SUMMARY:Buy milk, eggs\; bread tomorrow');
		$this->assertTrue($this->apply($calendar));
		/** @var VCalendar $reread */
		$reread = Reader::read($calendar->serialize());
		$this->assertSame('Buy milk, eggs; bread', (string)$reread->VTODO->SUMMARY);
		$this->assertSame('Buy milk, eggs; bread tomorrow', (string)$reread->VTODO->{ArrivalParser::ORIGINAL_SUMMARY});
	}
}
