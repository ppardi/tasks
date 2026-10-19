/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
	automaticReminderTime,
	fixedReminders,
	fixedTrigger,
	isAutomaticReminder,
	reminderChoices,
	reminderLabel,
} from '../../../../src/utils/reminders.js'

import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'

// Local times throughout, so the suite passes in any time zone.
// Wednesday, 21 October 2026, 2:30 PM.
const now = new Date(2026, 9, 21, 14, 30)
const locale = 'en-US'

const fixedAlarm = at => {
	const alarm = new ICAL.Component('valarm')
	alarm.addPropertyWithValue('action', 'DISPLAY')
	alarm.addPropertyWithValue('trigger', ICAL.Time.fromJSDate(at, true))
	return alarm
}

const relativeAlarm = duration => {
	const alarm = new ICAL.Component('valarm')
	alarm.addPropertyWithValue('action', 'DISPLAY')
	alarm.addPropertyWithValue('trigger', ICAL.Duration.fromString(duration))
	return alarm
}

const timedTask = due => ({ allDay: false, dueMoment: { isValid: () => true, toDate: () => due } })

describe('utils/reminders automaticReminderTime', () => {
	it('is the due time for a timed due date', () => {
		expect(automaticReminderTime(new Date(2026, 9, 23, 16, 0), false)).toEqual(new Date(2026, 9, 23, 16, 0))
	})

	it('is 9:00 AM on the day for an all-day due date', () => {
		expect(automaticReminderTime(new Date(2026, 9, 23), true)).toEqual(new Date(2026, 9, 23, 9, 0))
	})

	it('treats a due time of exactly midnight as a date, as quick-add sets it', () => {
		expect(automaticReminderTime(new Date(2026, 9, 21, 0, 0), false)).toEqual(new Date(2026, 9, 21, 9, 0))
	})
})

describe('utils/reminders isAutomaticReminder', () => {
	const due = new Date(2026, 9, 23, 16, 0)

	it('matches the due time to the minute, ignoring seconds', () => {
		expect(isAutomaticReminder(new Date(2026, 9, 23, 16, 0, 42), due, false)).toBe(true)
	})

	it('does not match a minute off', () => {
		expect(isAutomaticReminder(new Date(2026, 9, 23, 15, 59), due, false)).toBe(false)
	})

	it('matches 9:00 AM on an all-day due day', () => {
		expect(isAutomaticReminder(new Date(2026, 9, 23, 9, 0), new Date(2026, 9, 23), true)).toBe(true)
	})
})

describe('utils/reminders fixedReminders and fixedTrigger', () => {
	it('lists only fixed-time reminders, keeping their VALARM index', () => {
		const at = new Date(2026, 9, 22, 8, 0)
		const list = fixedReminders([relativeAlarm('-PT15M'), fixedAlarm(at)])
		expect(list).toEqual([{ index: 1, at }])
	})

	it('builds a UTC trigger for the given moment', () => {
		const at = new Date(2026, 9, 23, 16, 0)
		const trigger = fixedTrigger(at)
		expect(trigger.value.isUtc ?? trigger.value.zone === ICAL.Timezone.utcTimezone).toBeTruthy()
		expect(trigger.value.toJSDate()).toEqual(at)
	})
})

describe('utils/reminders reminderChoices', () => {
	it('offers four choices for a timed due date', () => {
		const choices = reminderChoices(new Date(2026, 9, 23, 16, 0), false)
		expect(choices.map(c => c.label)).toEqual(['At due time', '15 min before', '1 hour before', '1 day before'])
		expect(choices.map(c => c.key)).toEqual(['due', '15m', '1h', '1d'])
		expect(choices[2].at).toEqual(new Date(2026, 9, 23, 15, 0))
	})

	it('offers three 9:00 AM choices for an all-day due date', () => {
		const choices = reminderChoices(new Date(2026, 9, 23), true)
		expect(choices.map(c => c.label)).toEqual(['On the day, 9:00 AM', '1 day before, 9:00 AM', '1 week before, 9:00 AM'])
		expect(choices.map(c => c.at)).toEqual([new Date(2026, 9, 23, 9, 0), new Date(2026, 9, 22, 9, 0), new Date(2026, 9, 16, 9, 0)])
	})

	it('offers nothing without a due date', () => {
		expect(reminderChoices(null, false)).toEqual([])
	})
})

describe('utils/reminders reminderLabel', () => {
	const due = new Date(2026, 9, 23, 16, 0)

	it('names a fixed reminder that matches a choice', () => {
		expect(reminderLabel(fixedAlarm(new Date(2026, 9, 23, 15, 0)), timedTask(due), { now, locale })).toBe('1 hour before')
	})

	it('shows any other fixed reminder as a date and time', () => {
		expect(reminderLabel(fixedAlarm(new Date(2026, 9, 12, 9, 0)), timedTask(due), { now, locale })).toBe('Oct 12, 9:00 AM')
	})

	it('describes a reminder measured from the due date in words', () => {
		expect(reminderLabel(relativeAlarm('-PT2H'), timedTask(due), { now, locale })).toMatch(/2 hours before/)
	})
})
