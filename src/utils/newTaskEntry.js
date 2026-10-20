/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const pad = number => String(number).padStart(2, '0')

/**
 * Reads the parse endpoint's zone-less local time.
 *
 * @param {string} value 'YYYY-MM-DDTHH:mm:ss'
 * @return {Date} That wall-clock time, local
 */
export function parseLocalDateTime(value) {
	const [date, time = '00:00:00'] = value.split('T')
	const [year, month, day] = date.split('-').map(Number)
	const [hours, minutes, seconds = 0] = time.split(':').map(Number)
	return new Date(year, month - 1, day, hours, minutes, seconds)
}

/**
 * Writes a local time the way the endpoint and createTask take it; an all-day
 * date at midnight (ical.js cannot read a bare date here).
 *
 * @param {Date} date The date
 * @param {boolean} allDay Whether only the day counts
 * @return {string} 'YYYY-MM-DDTHH:mm:ss'
 */
export function formatLocalDateTime(date, allDay) {
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
	return allDay ? `${day}T00:00:00` : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * @param {string} due A zone-less local time
 * @param {boolean} allDay Whether only the day counts
 * @return {string} The same, at midnight when all day
 */
const normalized = (due, allDay) => (allDay ? `${due.slice(0, 10)}T00:00:00` : due)

/**
 * What the New task box saves for one entry: the parser's answer, adjusted by
 * the pills the user changed, over the view's defaults.
 *
 * @param {object} entry The entry, as it was at Enter
 * @param {string} entry.text The text typed
 * @param {?object} entry.answer The parser's answer ({ title, due, allDay, location }), or null if none came
 * @param {object} [entry.overrides] Changed pills: { date: { due, allDay }, place }
 * @param {object} [entry.viewDefaults] What the view adds: { due, allDay, start, priority }
 * @return {object} The createTask payload, without the list
 */
export function taskDataFromEntry({ text, answer, overrides = {}, viewDefaults = {} }) {
	const data = { summary: answer?.title || text }

	// The due date and its all-day flag go together
	const date = overrides.date ?? (answer?.due ? { due: answer.due, allDay: !!answer.allDay } : null)
	if (date) {
		data.due = normalized(date.due, date.allDay)
		data.allDay = date.allDay
	} else if (viewDefaults.due) {
		data.due = viewDefaults.due
		data.allDay = viewDefaults.allDay
	}

	// Current's start "now" would put a parsed due before its start, which the
	// server refuses
	if (viewDefaults.start && !(date && data.due < viewDefaults.start)) {
		data.start = viewDefaults.start
	}
	if (viewDefaults.priority) {
		data.priority = viewDefaults.priority
	}

	const location = overrides.place ?? answer?.location
	if (location) {
		data.location = location
	}
	return data
}
