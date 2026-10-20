/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Rules for the reminders the task panel writes (docs/TASK-PANEL-DESIGN.md).
 *
 * They are fixed times (TRIGGER;VALUE=DATE-TIME), because Apple Reminders,
 * which fires the reminders on Paul's devices, is proven to honour those. A
 * reminder is "automatic" when it sits at the due time, or at 9:00 AM on the
 * due day for an all-day task; nothing else marks it.
 */

import { translate as t } from '@nextcloud/l10n'
import ICAL from 'ical.js'
import { toRaw } from 'vue'

import { mapICALAlarmsToAlarmObjects } from '../models/alarm.js'
import { formatAlarm } from './dateStrings.js'
import { pillDateLabel } from './rowDate.js'

const MINUTE = 60 * 1000
const MORNING_HOUR = 9

/**
 * @param {Date} date A date
 * @param {number} hour The hour
 * @return {Date} That day at the given hour, local time
 */
function atHour(date, hour) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0)
}

/**
 * @param {Date} date A date
 * @param {number} days Days to add, negative for earlier
 * @return {Date}
 */
function addDays(date, days) {
	const result = new Date(date)
	result.setDate(result.getDate() + days)
	return result
}

/**
 * Where the automatic reminder goes for a due date.
 *
 * @param {Date} due The due date
 * @param {boolean} allDay Whether the due date is a date without a time
 * @return {Date} The due time, or 9:00 AM on the due day for an all-day due
 *   date or one at exactly midnight (as the Today and Week quick-add set it)
 */
export function automaticReminderTime(due, allDay) {
	const midnight = due.getHours() === 0 && due.getMinutes() === 0 && due.getSeconds() === 0
	if (allDay || midnight) {
		return atHour(due, MORNING_HOUR)
	}
	return new Date(due)
}

/**
 * @param {Date} at The reminder's time
 * @param {Date} due The due date
 * @param {boolean} allDay Whether the due date is all-day
 * @return {boolean} Whether the reminder sits where an automatic one would, to the minute
 */
export function isAutomaticReminder(at, due, allDay) {
	const auto = automaticReminderTime(due, allDay)
	return Math.floor(at.getTime() / MINUTE) === Math.floor(auto.getTime() / MINUTE)
}

/**
 * @param {Array} alarms The task's VALARM components (ICAL.Component)
 * @return {Array<{index: number, at: Date}>} The fixed-time reminders, with their VALARM index
 */
export function fixedReminders(alarms) {
	return (alarms || [])
		.map((alarm, index) => ({ index, trigger: alarm.getFirstPropertyValue('trigger') }))
		.filter(({ trigger }) => trigger instanceof ICAL.Time)
		// toRaw: in the reactive store the UTC zone comes back as a Proxy, which
		// ical.js no longer recognises as UTC, and toJSDate() then throws
		.map(({ index, trigger }) => ({ index, at: toRaw(trigger).toJSDate() }))
}

/**
 * @param {Date} at The moment to remind
 * @return {{value: ICAL.Time, parameter: undefined}} A trigger for Task.addAlarm / updateAlarm
 */
export function fixedTrigger(at) {
	return { value: ICAL.Time.fromJSDate(at, true), parameter: undefined }
}

/**
 * The reminder choices the picker offers for a due date.
 *
 * @param {Date|null} due The due date
 * @param {boolean} allDay Whether the due date is all-day
 * @return {Array<{key: string, label: string, at: Date}>}
 */
export function reminderChoices(due, allDay) {
	if (!due) {
		return []
	}
	if (allDay) {
		const morning = atHour(due, MORNING_HOUR)
		return [
			{ key: 'day', label: t('tasks', 'On the day, 9:00 AM'), at: morning },
			{ key: '1d9', label: t('tasks', '1 day before, 9:00 AM'), at: addDays(morning, -1) },
			{ key: '1w9', label: t('tasks', '1 week before, 9:00 AM'), at: addDays(morning, -7) },
		]
	}
	return [
		{ key: 'due', label: t('tasks', 'At due time'), at: new Date(due) },
		{ key: '15m', label: t('tasks', '15 min before'), at: new Date(due.getTime() - 15 * MINUTE) },
		{ key: '1h', label: t('tasks', '1 hour before'), at: new Date(due.getTime() - 60 * MINUTE) },
		{ key: '1d', label: t('tasks', '1 day before'), at: addDays(due, -1) },
	]
}

/**
 * The text of a reminder's pill.
 *
 * @param {object} alarm The VALARM component (ICAL.Component)
 * @param {object} task The task
 * @param {object} [options] Options
 * @param {Date} [options.now] The reference date
 * @param {string} [options.locale] A BCP 47 locale
 * @return {string}
 */
export function reminderLabel(alarm, task, { now = new Date(), locale } = {}) {
	const trigger = alarm.getFirstPropertyValue('trigger')
	if (trigger instanceof ICAL.Time) {
		const at = toRaw(trigger).toJSDate()
		const due = task.dueMoment?.isValid() ? task.dueMoment.toDate() : null
		const match = reminderChoices(due, task.allDay)
			.find(choice => Math.floor(choice.at.getTime() / MINUTE) === Math.floor(at.getTime() / MINUTE))
		return match ? match.label : pillDateLabel(at, true, now, locale)
	}
	const [alarmObject] = mapICALAlarmsToAlarmObjects([alarm])
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
	return alarmObject ? formatAlarm(alarmObject, task.allDay, timeZone, locale) : ''
}
