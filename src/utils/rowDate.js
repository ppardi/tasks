/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The short date shown after a task's name in the list ("Buy milk | Tomorrow").
 *
 * The date is the due date when there is one. Without one it is the task's
 * reminder: Apple Reminders writes a VALARM and no DUE for a dated reminder, so
 * those tasks would otherwise show no date at all. Completed tasks show when
 * they were completed.
 */

import { translate as t, getCanonicalLocale } from '@nextcloud/l10n'
import ICAL from 'ical.js'

const DAY = 24 * 60 * 60 * 1000

/**
 * @param {Date} date The date
 * @return {Date} Local midnight at the start of that date
 */
function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whole calendar days from `now` to `date`, counted in local time.
 * Rounding absorbs the hour lost or gained across a daylight-saving change.
 *
 * @param {Date} date The date
 * @param {Date} now The reference date
 * @return {number} Negative for the past
 */
function dayDifference(date, now) {
	return Math.round((startOfDay(date) - startOfDay(now)) / DAY)
}

/**
 * @param {Date} date The date to label
 * @param {boolean} timed Whether to append the time of day
 * @param {Date} now The reference date
 * @param {string} locale A BCP 47 locale
 * @return {string} e.g. "Today", "Fri", "Oct 12", "Apr 15, 2027", each with ", 9:00 AM" when timed
 */
export function shortDateLabel(date, timed, now, locale) {
	const days = dayDifference(date, now)
	let label
	if (days === 0) {
		label = t('tasks', 'Today')
	} else if (days === 1) {
		label = t('tasks', 'Tomorrow')
	} else if (days === -1) {
		label = t('tasks', 'Yesterday')
	} else if (days > 1 && days < 7) {
		label = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
	} else if (date.getFullYear() === now.getFullYear()) {
		label = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
	} else {
		label = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
	}
	if (!timed) {
		return label
	}
	const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
	return t('tasks', '{date}, {time}', { date: label, time })
}

/**
 * The reminder date to show for a task without a due date: the next reminder
 * still to come, or failing that the most recent one that has passed.
 * Relative reminders are skipped; without a due or start date they have
 * nothing to be relative to.
 *
 * @param {Array} alarms The task's VALARM components (ICAL.Component)
 * @param {Date} now The reference date
 * @return {Date|null} The reminder date, if any
 */
export function reminderDate(alarms, now) {
	const dates = (alarms || [])
		.map(alarm => alarm.getFirstPropertyValue('trigger'))
		.filter(trigger => trigger instanceof ICAL.Time)
		.map(trigger => trigger.toJSDate())
		.sort((a, b) => a - b)
	if (!dates.length) {
		return null
	}
	return dates.find(date => date >= now) ?? dates[dates.length - 1]
}

/**
 * @param {object} task The task
 * @param {object} [options] Options
 * @param {Date} [options.now] The reference date, for tests
 * @param {string} [options.locale] A BCP 47 locale, for tests
 * @return {{text: string, title: string, overdue: boolean}|null} What to show, or null for no date
 */
export function rowDate(task, { now = new Date(), locale = getCanonicalLocale() } = {}) {
	const full = (date, timed) => new Intl.DateTimeFormat(locale, timed
		? { dateStyle: 'full', timeStyle: 'short' }
		: { dateStyle: 'full' }).format(date)

	if (task.completed) {
		if (!task.completedDateMoment?.isValid()) {
			return null
		}
		const date = task.completedDateMoment.toDate()
		return {
			text: t('tasks', 'Completed {date}', { date: shortDateLabel(date, false, now, locale) }),
			title: t('tasks', 'Completed {date}', { date: full(date, true) }),
			overdue: false,
		}
	}

	if (task.dueMoment?.isValid()) {
		const date = task.dueMoment.toDate()
		const timed = !task.allDay
		return {
			text: shortDateLabel(date, timed, now, locale),
			title: t('tasks', 'Due {date}', { date: full(date, timed) }),
			overdue: timed ? date < now : startOfDay(date) < startOfDay(now),
		}
	}

	const date = reminderDate(task.alarms, now)
	if (date) {
		return {
			text: shortDateLabel(date, true, now, locale),
			title: t('tasks', 'Reminder {date}', { date: full(date, true) }),
			overdue: date < now,
		}
	}

	return null
}
