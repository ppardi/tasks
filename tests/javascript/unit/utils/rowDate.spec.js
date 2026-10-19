/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { rowDate, reminderDate, shortDateLabel } from '../../../../src/utils/rowDate.js'

import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

// Local times, so the suite passes in any time zone.
// Wednesday, 21 October 2026, 2:30 PM.
const now = new Date(2026, 9, 21, 14, 30)
const locale = 'en-US'
const opts = { now, locale }

const momentOf = date => ({ isValid: () => date !== null, toDate: () => date })
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
