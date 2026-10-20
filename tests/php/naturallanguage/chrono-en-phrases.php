<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2014 Wanasit Tanakitrungruang
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: MIT AND AGPL-3.0-or-later
 *
 * Phrases from chrono-node's English tests (github.com/wanasit/chrono,
 * test/en/), limited to the forms our parser reads (docs/NL-DATES-DESIGN.md,
 * "What the parser reads"). The phrases are chrono's; the expected values are
 * ours, worked out under our rules, which often differ from chrono's: a time
 * with no date that has passed means tomorrow, a date with no year that has
 * passed means next year, only the first date and first time phrase are read,
 * and an impossible date is not a date at all.
 *
 * A phrase that is only a date or time would leave an empty title, which is
 * no parse; those are prefixed with "Call Sam" to make them a task.
 *
 * Each row: input, title, due ('Y-m-d' all day, 'Y-m-d H:i' with a time, or
 * null), location. "Now" is Wednesday 21 October 2026, 2:30 PM in Phoenix.
 *
 * The phrases are used under chrono-node's license:
 *
 * The MIT License
 *
 * Copyright (c) 2014, Wanasit Tanakitrungruang
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

return [
	// en_casual.test.ts
	['The Deadline is Tomorrow', 'The Deadline is', '2026-10-22', null],
	['The Deadline is today', 'The Deadline is', '2026-10-21', null],
	['The Deadline is today 5PM', 'The Deadline is', '2026-10-21 17:00', null],
	// chrono: this morning; ours: 9 AM has passed, so tomorrow
	['The Deadline was this morning', 'The Deadline was', '2026-10-22 09:00', null],
	['Call Sam Tomorrow at noon', 'Call Sam', '2026-10-22 12:00', null],
	['Call Sam tomorrow morning', 'Call Sam', '2026-10-22 09:00', null],
	['Call Sam tonight', 'Call Sam', '2026-10-21 18:00', null],
	['Call Sam tonight 8pm', 'Call Sam', '2026-10-21 20:00', null],
	// "at 8" alone would be 8 AM; "tonight" makes it evening
	['Call Sam tonight at 8', 'Call Sam', '2026-10-21 20:00', null],
	['Call Sam this afternoon at 3', 'Call Sam', '2026-10-21 15:00', null],
	['Call Sam thurs', 'Call Sam', '2026-10-22', null],
	['I may by here. May the force be with you. Theresa may become PM soon.', 'I may by here. May the force be with you. Theresa may become PM soon.', null, null],
	['do I have the money', 'do I have the money', null, null],

	// en_weekday.test.ts
	['Call Sam Monday', 'Call Sam', '2026-10-26', null],
	// On a Wednesday, a bare or "next" Wednesday is a week away; "this" is today
	['Call Sam Next Wednesday', 'Call Sam', '2026-10-28', null],
	['Call Sam This Wednesday', 'Call Sam', '2026-10-21', null],
	['Call Sam Next Sunday', 'Call Sam', '2026-11-01', null],
	['Lets meet on Tuesday morning', 'Lets meet', '2026-10-27 09:00', null],
	// Only the first date phrase is read; the second stays in the title
	['Call Sam Sunday 12/7/2014', 'Call Sam 12/7/2014', '2026-10-25', null],

	// en_month_name_middle_endian.test.ts
	['The Deadline is August 10', 'The Deadline is', '2027-08-10', null],
	['Call Sam August 10, 2012', 'Call Sam', '2012-08-10', null],
	['The Deadline is Tuesday, January 10', 'The Deadline is, January 10', '2026-10-27', null],
	['Call Sam January 1st', 'Call Sam', '2027-01-01', null],
	['Call Sam Dec. 21', 'Call Sam', '2026-12-21', null],
	['Call Sam February 29, 2014', 'Call Sam February 29, 2014', null, null],
	['Call Sam August 32', 'Call Sam August 32', null, null],

	// en_month_name_little_endian.test.ts
	['The Deadline is 10 August', 'The Deadline is', '2027-08-10', null],
	['Call Sam 12th of July at 19:00', 'Call Sam', '2027-07-12 19:00', null],
	['Call Sam 31st March, 2016', 'Call Sam', '2016-03-31', null],
	['Call Sam 24th October, 9 pm', 'Call Sam', '2026-10-24 21:00', null],
	['Call Sam 24 October, 9 p.m.', 'Call Sam', '2026-10-24 21:00', null],
	// No 29 February this year or next: not a date
	['Call Sam 29 February', 'Call Sam 29 February', null, null],

	// en_slash.test.ts (US month/day)
	['Call Sam 8/10', 'Call Sam', '2027-08-10', null],
	['The Deadline is 8/10/2012', 'The Deadline is', '2012-08-10', null],
	['Call Sam 1/8 at 12pm', 'Call Sam', '2027-01-08 12:00', null],
	['Call Sam 8/32', 'Call Sam 8/32', null, null],

	// en_time_exp.test.ts
	['Call Sam 11am', 'Call Sam', '2026-10-22 11:00', null],
	['Call Sam at 1', 'Call Sam', '2026-10-22 13:00', null],
	['Call Sam 11 tonight', 'Call Sam', '2026-10-21 23:00', null],
	['Call Sam 6 in the afternoon', 'Call Sam', '2026-10-21 18:00', null],
	['Call Sam 6 in the morning', 'Call Sam', '2026-10-22 06:00', null],
	['Call Sam 8:23 AM, Jul 9', 'Call Sam', '2027-07-09 08:23', null],
	['Call Sam December 31, 2022 10:00 pm', 'Call Sam', '2022-12-31 22:00', null],
	// chrono (strict) reads no time here; ours does
	["I'm at 10", "I'm", '2026-10-22 10:00', null],
	["I'm at 101 points!", "I'm at 101 points!", null, null],
	['Call Sam at 6.5 kilograms', 'Call Sam at 6.5 kilograms', null, null],
	['Call Sam 14PM', 'Call Sam 14PM', null, null],

	// en_time_units_within.test.ts
	['Call Sam in a week', 'Call Sam', '2026-10-28', null],
	['we have to make something in 5 days.', 'we have to make something.', '2026-10-26', null],
	['we have to make something in five days.', 'we have to make something.', '2026-10-26', null],
];
