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

import { translate as t, translatePlural as n, getCanonicalLocale } from '@nextcloud/l10n'
import ICAL from 'ical.js'
import { toRaw } from 'vue'
import { repeatPreset } from './repeatPresets.js'

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
		// toRaw: in the reactive store the UTC zone comes back as a Proxy, which
		// ical.js no longer recognises as UTC, and toJSDate() then throws
		.map(trigger => toRaw(trigger).toJSDate())
		.sort((a, b) => a - b)
	if (!dates.length) {
		return null
	}
	return dates.find(date => date >= now) ?? dates[dates.length - 1]
}

/**
 * How a repeating task's run of missed occurrences reads: in days, weeks,
 * months or years when it repeats exactly once per one of them, else in times.
 * The unit comes from repeatPreset, so only the plain Daily, Weekly, Monthly
 * and Yearly rules get one; every other rule (weekdays, every 2 weeks, a COUNT
 * or UNTIL, two RRULEs) falls back to times, which is true of any rule.
 *
 * Each sentence is a whole literal, singular and plural alike, so translators
 * see every one. One miss is checked before n() rather than left to its
 * singular form, which some languages also use for 21, 31 and so on.
 *
 * @param {object} task The task
 * @return {string} e.g. "missed 2 weeks in a row", "missed yesterday"
 */
function missedText(task) {
	const count = task.missedCount
	const preset = task.hasMultipleRRules ? null : repeatPreset(task)
	switch (preset) {
	case 'daily':
		return count === 1
			? t('tasks', 'missed yesterday')
			: n('tasks', 'missed %n day in a row', 'missed %n days in a row', count)
	case 'weekly':
		return count === 1
			? t('tasks', 'missed last week')
			: n('tasks', 'missed %n week in a row', 'missed %n weeks in a row', count)
	case 'monthly':
		return count === 1
			? t('tasks', 'missed last month')
			: n('tasks', 'missed %n month in a row', 'missed %n months in a row', count)
	case 'yearly':
		return count === 1
			? t('tasks', 'missed last year')
			: n('tasks', 'missed %n year in a row', 'missed %n years in a row', count)
	default:
		return count === 1
			? t('tasks', 'missed last time')
			: n('tasks', 'missed %n time in a row', 'missed %n times in a row', count)
	}
}

/**
 * @param {string} title The date's hover text
 * @param {object} task The task
 * @param {string|null} late What lateText returned
 * @return {string} The hover text, with a line spelling out a run of misses
 */
function withMissedLine(title, task, late) {
	if (!late || !(task.missedCount > 0)) {
		return title
	}
	const line = task.missedCount === 1
		? t('tasks', 'Not completed the last time it came due')
		: n('tasks', 'Not completed the last %n time it came due', 'Not completed the last %n times it came due', task.missedCount)
	return `${title}\n${line}`
}

/**
 * What the nightly rollover adds after the date: occurrences a repeating task
 * missed, else whole days since the original date.
 *
 * @param {object} task The task
 * @param {Date|null} original The original due date or reminder
 * @param {Date} shown The date the task shows now
 * @param {Date} now The reference date
 * @return {string|null}
 */
function lateText(task, original, shown, now) {
	// The marks describe a task the nightly job left on today or earlier; a date
	// moved ahead (on the phone, say) means a new plan, and the job clears them
	if (startOfDay(shown) > startOfDay(now)) {
		return null
	}
	if (task.missedCount > 0) {
		return missedText(task)
	}
	if (!original) {
		return null
	}
	const days = Math.round((startOfDay(now) - startOfDay(original)) / DAY)
	return days > 0 ? n('tasks', '%n day late', '%n days late', days) : null
}

/**
 * @param {object} task The task
 * @param {object} [options] Options
 * @param {Date} [options.now] The reference date, for tests
 * @param {string} [options.locale] A BCP 47 locale, for tests
 * @return {{text: string, title: string, overdue: boolean, late: string|null}|null} What to show, or null for no date
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
			late: null,
		}
	}

	if (task.dueMoment?.isValid()) {
		const date = task.dueMoment.toDate()
		const timed = !task.allDay
		const late = lateText(task, task.originalDue ?? null, date, now)
		return {
			text: shortDateLabel(date, timed, now, locale),
			title: withMissedLine(t('tasks', 'Due {date}', { date: full(date, timed) }), task, late),
			overdue: timed ? date < now : startOfDay(date) < startOfDay(now),
			late,
		}
	}

	const date = reminderDate(task.alarms, now)
	if (date) {
		const late = lateText(task, task.originalReminder ?? null, date, now)
		return {
			text: shortDateLabel(date, true, now, locale),
			title: withMissedLine(t('tasks', 'Reminder {date}', { date: full(date, true) }), task, late),
			overdue: date < now,
			late,
		}
	}

	return null
}
