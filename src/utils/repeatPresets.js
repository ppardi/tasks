/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The simple repeat choices of the task panel's Repeat pill. Anything else is
 * made, and shown, through the full repeat editor.
 */

import { translate as t } from '@nextcloud/l10n'

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR']
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * @return {Array<{key: string, label: string}>} The presets, in menu order
 */
export function repeatPresets() {
	return [
		{ key: 'never', label: t('tasks', 'Never') },
		{ key: 'daily', label: t('tasks', 'Daily') },
		{ key: 'weekdays', label: t('tasks', 'Weekdays') },
		{ key: 'weekly', label: t('tasks', 'Weekly') },
		{ key: 'monthly', label: t('tasks', 'Monthly') },
		{ key: 'yearly', label: t('tasks', 'Yearly') },
	]
}

/**
 * Which preset a task's repeat rule is. Parsing fills in the day from the due
 * or start date (a weekly rule gains BYDAY, a monthly one BYMONTHDAY), so a
 * filled-in value equal to that date still counts as the plain preset.
 *
 * @param {object} task The task
 * @return {string|null} A preset key, or null for a rule only the full editor describes
 */
export function repeatPreset(task) {
	if (!task.isRecurring) {
		return 'never'
	}
	const rule = task.recurrenceRule
	if ((rule.interval || 1) !== 1 || rule.count || rule.until || rule.bySetPosition) {
		return null
	}
	const base = task.dueMoment.isValid() ? task.dueMoment : task.startMoment
	const byDay = rule.byDay || []
	const byMonthDay = (rule.byMonthDay || []).map(Number)
	const byMonth = (rule.byMonth || []).map(Number)
	const onlyBaseDay = byDay.length === 0 || (byDay.length === 1 && byDay[0] === DAY_CODES[base.day()])
	const onlyBaseDate = byMonthDay.length === 0 || (byMonthDay.length === 1 && byMonthDay[0] === base.date())
	const onlyBaseMonth = byMonth.length === 0 || (byMonth.length === 1 && byMonth[0] === base.month() + 1)

	switch (rule.frequency) {
	case 'DAILY':
		return byDay.length === 0 ? 'daily' : null
	case 'WEEKLY':
		if (byDay.length === 5 && WEEKDAYS.every(day => byDay.includes(day))) {
			return 'weekdays'
		}
		return onlyBaseDay ? 'weekly' : null
	case 'MONTHLY':
		return byDay.length === 0 && onlyBaseDate ? 'monthly' : null
	case 'YEARLY':
		return byDay.length === 0 && onlyBaseDate && onlyBaseMonth ? 'yearly' : null
	default:
		return null
	}
}

/**
 * @param {string} preset A preset key other than 'never'
 * @return {object} The recurrence data for the store's setRecurrenceRule
 */
export function repeatRuleFor(preset) {
	switch (preset) {
	case 'daily':
		return { frequency: 'DAILY', interval: 1 }
	case 'weekdays':
		return { frequency: 'WEEKLY', interval: 1, byDay: [...WEEKDAYS] }
	case 'weekly':
		return { frequency: 'WEEKLY', interval: 1 }
	case 'monthly':
		return { frequency: 'MONTHLY', interval: 1 }
	case 'yearly':
		return { frequency: 'YEARLY', interval: 1 }
	default:
		throw new Error(`No repeat rule for preset ${preset}`)
	}
}
