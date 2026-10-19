<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Tests\Rollover;

use DateTimeImmutable;
use DateTimeZone;
use OCA\Tasks\Rollover\RolloverCalculator;
use PHPUnit\Framework\TestCase;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

/**
 * Times are Phoenix local (UTC-7, no daylight saving): 16:00 local is 23:00Z.
 * "Now" is Wednesday 21 October 2026, 2:30 PM local.
 */
class RolloverCalculatorTest extends TestCase {
	private DateTimeZone $zone;
	private DateTimeImmutable $now;
	private RolloverCalculator $calculator;

	protected function setUp(): void {
		$this->zone = new DateTimeZone('America/Phoenix');
		$this->now = new DateTimeImmutable('2026-10-21 14:30', $this->zone);
		$this->calculator = new RolloverCalculator();
	}

	private function task(string ...$lines): VCalendar {
		$ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VTODO\r\n"
			. "UID:t1\r\nDTSTAMP:20261019T120000Z\r\nSUMMARY:x\r\n"
			. implode("\r\n", $lines) . "\r\nEND:VTODO\r\nEND:VCALENDAR\r\n";
		/** @var VCalendar */
		return Reader::read($ics);
	}

	private function alarm(string $utc): string {
		return "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nTRIGGER;VALUE=DATE-TIME:$utc\r\nEND:VALARM";
	}

	private function local(VCalendar $calendar, string $property): string {
		// getDateTime() applies the zone to floating times only; convert the rest
		return $calendar->VTODO->{$property}->getDateTime($this->zone)->setTimezone($this->zone)->format('Y-m-d H:i');
	}

	private function alarmsLocal(VCalendar $calendar): array {
		$times = [];
		foreach ($calendar->VTODO->select('VALARM') as $alarm) {
			$trigger = $alarm->TRIGGER;
			$times[] = ($trigger['VALUE'] ?? null) && strtoupper((string)$trigger['VALUE']) === 'DATE-TIME'
				? $trigger->getDateTime()->setTimezone($this->zone)->format('Y-m-d H:i')
				: (string)$trigger;
		}
		return $times;
	}

	private function apply(VCalendar $calendar): bool {
		return $this->calculator->apply($calendar, $this->zone, $this->now);
	}

	public function testTimedDueRollsToTodayKeepingItsTime(): void {
		$calendar = $this->task('DUE:20261020T230000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-21 16:00', $this->local($calendar, 'DUE'));
		$this->assertSame('20261020T230000Z', (string)$calendar->VTODO->{RolloverCalculator::ORIGINAL_DUE});
	}

	public function testAllDayDueStaysAllDay(): void {
		$calendar = $this->task('DUE;VALUE=DATE:20261019');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('20261021', (string)$calendar->VTODO->DUE);
		$this->assertFalse($calendar->VTODO->DUE->hasTime());
		$this->assertSame('20261019', (string)$calendar->VTODO->{RolloverCalculator::ORIGINAL_DUE});
		$this->assertSame('DATE', (string)$calendar->VTODO->{RolloverCalculator::ORIGINAL_DUE}['VALUE']);
	}

	public function testTimeZoneDueKeepsItsZone(): void {
		$calendar = $this->task('DUE;TZID=America/Phoenix:20261019T090000');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('America/Phoenix', (string)$calendar->VTODO->DUE['TZID']);
		$this->assertSame('2026-10-21 09:00', $this->local($calendar, 'DUE'));
	}

	/**
	 * @dataProvider untouchedTasks
	 */
	public function testLeavesAloneWhatHasNothingToRoll(array $lines): void {
		$calendar = $this->task(...$lines);
		$before = $calendar->serialize();
		$this->assertFalse($this->apply($calendar));
		$this->assertSame($before, $calendar->serialize());
	}

	public static function untouchedTasks(): array {
		return [
			'due today' => [['DUE:20261021T230000Z']],
			'due earlier today, already past' => [['DUE:20261021T160000Z']],
			'due tomorrow' => [['DUE:20261022T230000Z']],
			'completed' => [['DUE:20261020T230000Z', 'STATUS:COMPLETED']],
			'cancelled' => [['DUE:20261020T230000Z', 'STATUS:CANCELLED']],
			'no dates at all' => [[]],
			'start date only' => [['DTSTART:20261019T160000Z']],
			'reminder-only, one reminder still to come' => [[
				"BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:R\r\nTRIGGER;VALUE=DATE-TIME:20261018T160000Z\r\nEND:VALARM",
				"BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:R\r\nTRIGGER;VALUE=DATE-TIME:20261021T230000Z\r\nEND:VALARM",
			]],
			'weekly, missed but next occurrence not yet come' => [['DUE:20261019T160000Z', 'RRULE:FREQ=WEEKLY']],
		];
	}

	public function testStartMovesWithTheDueDate(): void {
		$calendar = $this->task('DTSTART:20261019T160000Z', 'DUE:20261020T230000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-20 09:00', $this->local($calendar, 'DTSTART'));
		$this->assertSame('2026-10-21 16:00', $this->local($calendar, 'DUE'));
	}

	public function testFixedRemindersMoveRelativeOnesDoNot(): void {
		$calendar = $this->task(
			'DUE:20261020T230000Z',
			$this->alarm('20261020T220000Z'),
			"BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:R\r\nTRIGGER;RELATED=END:-PT1H\r\nEND:VALARM",
		);
		$this->assertTrue($this->apply($calendar));
		$this->assertSame(['2026-10-21 15:00', '-PT1H'], $this->alarmsLocal($calendar));
	}

	public function testSecondRolloverKeepsTheFirstOriginalDueDate(): void {
		$calendar = $this->task('DUE:20261020T230000Z', 'X-NEXTCLOUD-TASKS-ORIGINAL-DUE:20261017T230000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('20261017T230000Z', (string)$calendar->VTODO->{RolloverCalculator::ORIGINAL_DUE});
	}

	public function testRollingTwiceTheSameDayChangesNothingTheSecondTime(): void {
		$calendar = $this->task('DUE:20261018T230000Z', $this->alarm('20261018T220000Z'));
		$this->assertTrue($this->apply($calendar));
		$after = $calendar->serialize();
		$this->assertFalse($this->apply($calendar));
		$this->assertSame($after, $calendar->serialize());
	}

	public function testReminderOnlyTaskMovesItsRemindersSoTheLatestLandsToday(): void {
		$calendar = $this->task($this->alarm('20261018T160000Z'), $this->alarm('20261020T000000Z'));
		$this->assertTrue($this->apply($calendar));
		// 18th 09:00 and 19th 17:00 local move by two days
		$this->assertSame(['2026-10-20 09:00', '2026-10-21 17:00'], $this->alarmsLocal($calendar));
		$this->assertSame('20261020T000000Z', (string)$calendar->VTODO->{RolloverCalculator::ORIGINAL_REMINDER});
		$this->assertFalse(isset($calendar->VTODO->DUE));
	}

	public function testWeeklyTaskJumpsToItsLatestOccurrenceCountingTheMissedOne(): void {
		$calendar = $this->task('DUE:20261012T160000Z', 'RRULE:FREQ=WEEKLY;COUNT=5');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-19 09:00', $this->local($calendar, 'DUE'));
		$this->assertSame('1', (string)$calendar->VTODO->{RolloverCalculator::MISSED});
		$this->assertSame('FREQ=WEEKLY;COUNT=4', (string)$calendar->VTODO->RRULE);
	}

	public function testDailyTaskNeverRollsItJustCountsMissedDays(): void {
		$calendar = $this->task('DUE:20261018T150000Z', 'RRULE:FREQ=DAILY');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-21 08:00', $this->local($calendar, 'DUE'));
		$this->assertSame('3', (string)$calendar->VTODO->{RolloverCalculator::MISSED});
	}

	public function testMissedCountAddsUp(): void {
		$calendar = $this->task('DUE:20261019T150000Z', 'RRULE:FREQ=DAILY', 'X-NEXTCLOUD-TASKS-MISSED:4');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('6', (string)$calendar->VTODO->{RolloverCalculator::MISSED});
	}

	public function testRepeatingTaskWhoseSeriesHasEndedRollsLikeAnOrdinaryTask(): void {
		$calendar = $this->task('DUE:20261012T160000Z', 'RRULE:FREQ=WEEKLY;UNTIL=20261015T000000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-21 09:00', $this->local($calendar, 'DUE'));
		$this->assertFalse(isset($calendar->VTODO->{RolloverCalculator::MISSED}));
	}

	public function testLocalDateDecidesNotTheUtcDate(): void {
		// 23:30 local on the 20th is already the 21st in UTC: it is still yesterday's task
		$calendar = $this->task('DUE:20261021T063000Z');
		$this->assertTrue($this->apply($calendar));
		$this->assertSame('2026-10-21 23:30', $this->local($calendar, 'DUE'));
	}
}
