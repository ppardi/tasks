/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A repeat rule that leaves out the day repeats on the task's own day.
 */

import Task from '../../../../src/models/task.js'

import { describe, expect, it } from 'vitest'

const makeTask = lines => new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
	'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:x', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'),
{ id: 'cal', tasks: {} })

describe('models/task - repeat rule without a day', () => {
	it('repeats weekly on the weekday of the due date, not on Monday', () => {
		// Friday, 23 October 2026
		expect(makeTask(['DUE:20261023T160000', 'RRULE:FREQ=WEEKLY']).recurrenceRule.byDay).toEqual(['FR'])
	})

	it('repeats monthly on the day of the month of the due date', () => {
		expect(makeTask(['DUE:20261023T160000', 'RRULE:FREQ=MONTHLY']).recurrenceRule.byMonthDay).toEqual([23])
	})

	it('repeats yearly in the month of the due date', () => {
		expect(makeTask(['DUE:20261023T160000', 'RRULE:FREQ=YEARLY']).recurrenceRule.byMonth).toEqual([10])
	})
})
