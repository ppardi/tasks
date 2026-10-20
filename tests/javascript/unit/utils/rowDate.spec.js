/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { pillDateLabel, rowDate, reminderDate, shortDateLabel } from '../../../../src/utils/rowDate.js'

import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

// Local times, so the suite passes in any time zone.
// Wednesday, 21 October 2026, 2:30 PM.
const now = new Date(2026, 9, 21, 14, 30)
const locale = 'en-US'
const opts = { now, locale }

const momentOf = date => ({
	isValid: () => date !== null,
	toDate: () => date,
	// What repeatPreset reads from a moment
	day: () => date.getDay(),
	date: () => date.getDate(),
	month: () => date.getMonth(),
})
const noDate = momentOf(null)

const task = (props = {}) => ({
	completed: false,
	completedDateMoment: noDate,
	dueMoment: noDate,
	allDay: false,
	alarms: [],
	...props,
})

const absoluteAlarm = date => {
	const alarm = new ICAL.Component('valarm')
	alarm.addPropertyWithValue('action', 'DISPLAY')
	alarm.addPropertyWithValue('trigger', ICAL.Time.fromJSDate(date, true))
	return alarm
}

const relativeAlarm = () => {
	const alarm = new ICAL.Component('valarm')
	alarm.addPropertyWithValue('action', 'DISPLAY')
	alarm.addPropertyWithValue('trigger', ICAL.Duration.fromString('-PT15M'))
	return alarm
}

describe('utils/rowDate pillDateLabel', () => {
	const label = (date, timed = false) => pillDateLabel(date, timed, now, locale)

	it('keeps the words for the days either side of today', () => {
		expect(label(new Date(2026, 9, 21))).toBe('Today')
		expect(label(new Date(2026, 9, 22, 8, 0), true)).toBe('Tomorrow, 8:00 AM')
		expect(label(new Date(2026, 9, 20))).toBe('Yesterday')
	})

	it('names the exact day from the day after tomorrow, where the list says just "Mon"', () => {
		expect(label(new Date(2026, 9, 26))).toBe('Mon, Oct 26')
		expect(label(new Date(2026, 9, 23, 16, 0), true)).toBe('Fri, Oct 23, 4:00 PM')
		expect(label(new Date(2026, 9, 12))).toBe('Mon, Oct 12')
	})

	it('adds the year when it is not this year', () => {
		expect(label(new Date(2027, 3, 15))).toBe('Thu, Apr 15, 2027')
	})
})

describe('utils/rowDate shortDateLabel', () => {
	const label = (date, timed = false) => shortDateLabel(date, timed, now, locale)

	it('names the days either side of today', () => {
		expect(label(new Date(2026, 9, 21))).toBe('Today')
		expect(label(new Date(2026, 9, 22))).toBe('Tomorrow')
		expect(label(new Date(2026, 9, 20))).toBe('Yesterday')
	})

	it('uses the weekday for the rest of the coming week', () => {
		expect(label(new Date(2026, 9, 23))).toBe('Fri')
		expect(label(new Date(2026, 9, 27))).toBe('Tue')
	})

	it('uses month and day from a week out, and for the past', () => {
		expect(label(new Date(2026, 9, 28))).toBe('Oct 28')
		expect(label(new Date(2026, 9, 12))).toBe('Oct 12')
	})

	it('adds the year only when it is not this year', () => {
		expect(label(new Date(2027, 3, 15))).toBe('Apr 15, 2027')
		expect(label(new Date(2025, 11, 31))).toBe('Dec 31, 2025')
	})

	it('appends the time for timed dates', () => {
		expect(label(new Date(2026, 9, 21, 9, 0), true)).toBe('Today, 9:00 AM')
		expect(label(new Date(2026, 9, 12, 9, 0), true)).toBe('Oct 12, 9:00 AM')
	})

	it('counts calendar days, not 24-hour spans', () => {
		// 11 PM tomorrow is more than 24 hours away and is still "Tomorrow".
		expect(label(new Date(2026, 9, 22, 23, 0))).toBe('Tomorrow')
		// 12:05 AM today is less than 24 hours ago and is still "Today".
		expect(label(new Date(2026, 9, 21, 0, 5))).toBe('Today')
	})
})

describe('utils/rowDate reminderDate', () => {
	it('returns null without absolute reminders', () => {
		expect(reminderDate([], now)).toBeNull()
		expect(reminderDate([relativeAlarm()], now)).toBeNull()
	})

	it('prefers the next reminder still to come', () => {
		const past = new Date(2026, 9, 12, 9, 0)
		const soon = new Date(2026, 9, 23, 9, 0)
		const later = new Date(2026, 10, 1, 9, 0)
		expect(reminderDate([absoluteAlarm(later), absoluteAlarm(past), absoluteAlarm(soon)], now)).toEqual(soon)
	})

	it('reads reminders held in the reactive store', () => {
		const date = new Date(2026, 9, 23, 9, 0)
		expect(reminderDate(reactive([absoluteAlarm(date)]), now)).toEqual(date)
	})

	it('falls back to the most recent past reminder', () => {
		const older = new Date(2026, 9, 1, 9, 0)
		const recent = new Date(2026, 9, 12, 9, 0)
		expect(reminderDate([absoluteAlarm(recent), absoluteAlarm(older)], now)).toEqual(recent)
	})
})

describe('utils/rowDate rowDate', () => {
	it('shows nothing for a task with no dates', () => {
		expect(rowDate(task(), opts)).toBeNull()
	})

	it('marks an all-day due date overdue only once the day has passed', () => {
		const today = rowDate(task({ allDay: true, dueMoment: momentOf(new Date(2026, 9, 21)) }), opts)
		expect(today).toMatchObject({ text: 'Today', overdue: false })
		const yesterday = rowDate(task({ allDay: true, dueMoment: momentOf(new Date(2026, 9, 20)) }), opts)
		expect(yesterday).toMatchObject({ text: 'Yesterday', overdue: true })
	})

	it('marks a timed due date overdue as soon as the time has passed', () => {
		const earlier = rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 21, 9, 0)) }), opts)
		expect(earlier).toMatchObject({ text: 'Today, 9:00 AM', overdue: true })
		const later = rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 21, 17, 0)) }), opts)
		expect(later).toMatchObject({ text: 'Today, 5:00 PM', overdue: false })
	})

	it('uses the reminder when there is no due date, the way Apple Reminders writes them', () => {
		const result = rowDate(task({ alarms: [absoluteAlarm(new Date(2026, 9, 12, 9, 0))] }), opts)
		expect(result).toMatchObject({ text: 'Oct 12, 9:00 AM', overdue: true })
		expect(result.title).toMatch(/^Reminder /)
	})

	it('prefers the due date over a reminder', () => {
		const result = rowDate(task({
			allDay: true,
			dueMoment: momentOf(new Date(2026, 9, 23)),
			alarms: [absoluteAlarm(new Date(2026, 9, 12, 9, 0))],
		}), opts)
		expect(result).toMatchObject({ text: 'Fri', overdue: false })
		expect(result.title).toMatch(/^Due /)
	})

	it('shows when a completed task was completed, never as overdue', () => {
		const result = rowDate(task({
			completed: true,
			completedDateMoment: momentOf(new Date(2026, 9, 21, 10, 0)),
			dueMoment: momentOf(new Date(2026, 9, 1)),
		}), opts)
		expect(result).toMatchObject({ text: 'Completed Today', overdue: false })
	})
})

describe('utils/rowDate rowDate - rollover', () => {
	it('says how many days late a rolled-over task is', () => {
		const due = rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 21, 16, 0)), originalDue: new Date(2026, 9, 18, 16, 0) }), opts)
		expect(due).toMatchObject({ text: 'Today, 4:00 PM', late: '3 days late' })
		const oneDay = rowDate(task({ allDay: true, dueMoment: momentOf(new Date(2026, 9, 21)), originalDue: new Date(2026, 9, 20) }), opts)
		expect(oneDay.late).toBe('1 day late')
	})

	it('counts from the original reminder for a reminder-only task', () => {
		const result = rowDate(task({ alarms: [absoluteAlarm(new Date(2026, 9, 21, 17, 0))], originalReminder: new Date(2026, 9, 19, 17, 0) }), opts)
		expect(result.late).toBe('2 days late')
	})

	// Monday, 19 October 2026, 9:00 AM: the occurrence the job jumped to
	const repeating = (rule, missedCount, props = {}) => task({
		dueMoment: momentOf(new Date(2026, 9, 19, 9, 0)),
		isRecurring: true,
		hasMultipleRRules: false,
		recurrenceRule: { frequency: 'NONE', interval: 1, count: null, until: null, byDay: [], byMonth: [], byMonthDay: [], bySetPosition: null, ...rule },
		missedCount,
		...props,
	})
	const missed = (rule, count, props) => rowDate(repeating(rule, count, props), opts).late

	it('counts the misses in the unit the task repeats by', () => {
		expect(missed({ frequency: 'DAILY' }, 2)).toBe('missed 2 days in a row')
		expect(missed({ frequency: 'WEEKLY', byDay: ['MO'] }, 2)).toBe('missed 2 weeks in a row')
		expect(missed({ frequency: 'MONTHLY', byMonthDay: [19] }, 3)).toBe('missed 3 months in a row')
		expect(missed({ frequency: 'YEARLY', byMonth: [10], byMonthDay: [19] }, 2)).toBe('missed 2 years in a row')
	})

	it('names a single miss in plain words', () => {
		expect(missed({ frequency: 'DAILY' }, 1)).toBe('missed yesterday')
		expect(missed({ frequency: 'WEEKLY' }, 1)).toBe('missed last week')
		expect(missed({ frequency: 'MONTHLY' }, 1)).toBe('missed last month')
		expect(missed({ frequency: 'YEARLY' }, 1)).toBe('missed last year')
	})

	it('counts times for a task that does not repeat once per day, week, month or year', () => {
		expect(missed({ frequency: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }, 3)).toBe('missed 3 times in a row')
		expect(missed({ frequency: 'WEEKLY', interval: 2 }, 2)).toBe('missed 2 times in a row')
		expect(missed({ frequency: 'WEEKLY', byDay: ['MO', 'TH'] }, 2)).toBe('missed 2 times in a row')
		expect(missed({ frequency: 'MONTHLY', byDay: ['MO'], bySetPosition: -1 }, 2)).toBe('missed 2 times in a row')
		expect(missed({ frequency: 'HOURLY' }, 4)).toBe('missed 4 times in a row')
		expect(missed({ frequency: 'DAILY' }, 2, { hasMultipleRRules: true })).toBe('missed 2 times in a row')
		expect(missed({ frequency: 'WEEKLY', interval: 2 }, 1)).toBe('missed last time')
	})

	it('spells the count out on hover', () => {
		const two = rowDate(repeating({ frequency: 'WEEKLY' }, 2), opts)
		expect(two.title).toBe('Due Monday, October 19, 2026 at 9:00 AM\nNot completed the last 2 times it came due')
		const one = rowDate(repeating({ frequency: 'WEEKLY' }, 1), opts)
		expect(one.title).toBe('Due Monday, October 19, 2026 at 9:00 AM\nNot completed the last time it came due')
	})

	it('says nothing more for a task that never rolled', () => {
		expect(rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 21, 16, 0)) }), opts).late).toBeNull()
	})

	it('says nothing once the date was moved ahead elsewhere, as on the phone', () => {
		const moved = rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 30, 16, 0)), originalDue: new Date(2026, 9, 18, 16, 0) }), opts)
		expect(moved.late).toBeNull()
		const advanced = rowDate(task({ dueMoment: momentOf(new Date(2026, 9, 26, 9, 0)), missedCount: 2 }), opts)
		expect(advanced.late).toBeNull()
	})
})
