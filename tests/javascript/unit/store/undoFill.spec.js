/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Undo for a task the server filled in on arrival (docs/NL-DATES-DESIGN.md,
 * "Undo"): the original title comes back and what the server added goes.
 * Changing the title, date or place by hand accepts the parse and drops the marks.
 */

import tasksStore from '../../../../src/store/tasks.js'
import Task from '../../../../src/models/task.js'
import { fixedReminders } from '../../../../src/utils/reminders.js'

import moment from '@nextcloud/moment'
import ICAL from 'ical.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { actions, mutations } = tasksStore

// Wednesday, 21 October 2026, 2:30 PM local
const NOW = new Date(2026, 9, 21, 14, 30)
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)
const utc = date => ICAL.Time.fromJSDate(date, true).toICALString()

const SENTENCE = 'Pick up milk\\, eggs tomorrow at 10am at the grocery store'
const ORIGINAL = 'Pick up milk, eggs tomorrow at 10am at the grocery store'

const alarmLines = (date, tagged = false) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder',
	`TRIGGER;VALUE=DATE-TIME:${utc(date)}`, ...(tagged ? ['X-NEXTCLOUD-TASKS-AUTOMATIC:1'] : []), 'END:VALARM']

/**
 * @param {string[]} lines VTODO lines after UID and DTSTAMP
 * @param {object} calendarProps Calendar overrides
 * @return {Task}
 */
function makeTask(lines = [], calendarProps = {}) {
	const calendar = { id: 'cal', tasks: {}, readOnly: false, isSharedWithMe: false, ...calendarProps }
	const task = new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
		'UID:t1', 'DTSTAMP:20261021T120000Z', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'), calendar)
	calendar.tasks[task.uid] = task
	return task
}

/**
 * As the server writes it: date and place read from the title, the reminder
 * tagged, and the nightly rollover's marks besides (to see they go too).
 *
 * @param {string[]} extra More VTODO lines
 * @return {Task}
 */
const filledTask = (extra = []) => makeTask(['SUMMARY:Pick up milk\\, eggs',
	`X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:${SENTENCE}`,
	'X-NEXTCLOUD-TASKS-FILLED:DUE,LOCATION',
	`DUE:${utc(at(22, 10))}`,
	'LOCATION:the grocery store',
	...alarmLines(at(22, 10), true),
	...extra])

/**
 * A store context that applies real mutations and records commits and dispatches.
 *
 * @param {Task} task The task getters return
 * @return {object}
 */
function makeContext(task) {
	const context = {
		state: { tasks: {} },
		rootState: { settings: { settings: { allDay: 0 } } },
		getters: { getParentTask: () => null, getTaskByUri: () => task, getTaskByUid: () => null },
		commits: [],
		dispatched: [],
		commit: (name, payload) => {
			context.commits.push(name)
			return mutations[name]?.(context.state, payload)
		},
		dispatch: async (name, payload) => {
			context.dispatched.push(name)
			if (name === 'updateTask' || name === 'setSetting') {
				return undefined
			}
			return actions[name]?.(context, payload)
		},
	}
	return context
}

const hasMarks = task => task.vtodo.hasProperty('x-nextcloud-tasks-original-summary') || task.vtodo.hasProperty('x-nextcloud-tasks-filled')
const reminderTimes = task => fixedReminders(task.alarms).map(r => r.at)

describe('models/task - fill marks', () => {
	it('reads the original title, unescaped, and what was filled in', () => {
		const task = filledTask()
		expect(task.originalSummary).toBe(ORIGINAL)
		expect(task.filledFields).toEqual(['DUE', 'LOCATION'])
	})

	it('reads a single field, and no list as an empty one', () => {
		expect(makeTask(['SUMMARY:x', 'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:x', 'X-NEXTCLOUD-TASKS-FILLED:LOCATION']).filledFields).toEqual(['LOCATION'])
		const reminderOnly = makeTask(['SUMMARY:x', 'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:x'])
		expect(reminderOnly.originalSummary).toBe('x')
		expect(reminderOnly.filledFields).toEqual([])
	})

	it('tells an empty original title from none', () => {
		expect(makeTask(['X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:']).originalSummary).toBe('')
		expect(makeTask(['SUMMARY:x']).originalSummary).toBeNull()
		expect(makeTask(['SUMMARY:x']).filledFields).toEqual([])
	})

	it('clearFill() removes both marks', () => {
		const task = filledTask()
		task.clearFill()
		expect(hasMarks(task)).toBe(false)
		expect(task.originalSummary).toBeNull()
		expect(task.filledFields).toEqual([])
	})
})

describe('store/tasks - undoFill', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('puts the title back and removes the due date, the place, the reminder and every mark', async () => {
		const task = filledTask(['X-NEXTCLOUD-TASKS-ORIGINAL-DUE:20261018T230000Z', 'X-NEXTCLOUD-TASKS-MISSED:1'])
		const context = makeContext(task)
		await actions.undoFill(context, { task })
		expect(task.summary).toBe(ORIGINAL)
		expect(task.vtodo.getFirstPropertyValue('summary')).toBe(ORIGINAL)
		expect(task.vtodo.hasProperty('due')).toBe(false)
		expect(task.dueMoment.isValid()).toBe(false)
		expect(task.vtodo.hasProperty('location')).toBe(false)
		expect(task.location).toBe('')
		expect(task.alarms).toHaveLength(0)
		expect(hasMarks(task)).toBe(false)
		expect(task.originalSummary).toBeNull()
		expect(task.originalDue).toBeNull()
		expect(task.missedCount).toBe(0)
	})

	it('changes the task through mutations and saves it once', async () => {
		const task = filledTask()
		const context = makeContext(task)
		await actions.undoFill(context, { task })
		// No action such as setDue or setSummary ran: they would drop the marks
		// mid-undo and apply the reminder rule
		expect(context.dispatched).toEqual(['updateTask'])
	})

	it('keeps a due date the task arrived with, and removes the tagged reminder', async () => {
		const task = makeTask(['SUMMARY:Dentist at the clinic',
			'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:Dentist at the clinic',
			'X-NEXTCLOUD-TASKS-FILLED:LOCATION',
			`DUE:${utc(at(23, 15))}`,
			'LOCATION:the clinic',
			...alarmLines(at(23, 15), true)])
		await actions.undoFill(makeContext(task), { task })
		expect(task.dueMoment.toDate()).toEqual(at(23, 15))
		expect(task.location).toBe('')
		expect(task.alarms).toHaveLength(0)
		expect(hasMarks(task)).toBe(false)
	})

	it('with nothing listed, removes just the reminder and restores the title', async () => {
		const task = makeTask(['SUMMARY:Dentist',
			'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:Dentist',
			`DUE:${utc(at(23, 15))}`,
			'LOCATION:Main Street',
			...alarmLines(at(23, 15), true)])
		await actions.undoFill(makeContext(task), { task })
		expect(task.summary).toBe('Dentist')
		expect(task.dueMoment.toDate()).toEqual(at(23, 15))
		expect(task.location).toBe('Main Street')
		expect(task.alarms).toHaveLength(0)
	})

	it('finds the automatic reminder by its time when another app dropped the tag', async () => {
		const task = makeTask(['SUMMARY:Pick up milk',
			`X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:${SENTENCE}`,
			'X-NEXTCLOUD-TASKS-FILLED:DUE',
			`DUE:${utc(at(22, 10))}`,
			...alarmLines(at(22, 10)),
			...alarmLines(at(22, 8))])
		await actions.undoFill(makeContext(task), { task })
		// Found against the due date before it was removed; the other reminder stays
		expect(reminderTimes(task)).toEqual([at(22, 8)])
		expect(task.vtodo.hasProperty('due')).toBe(false)
	})

	it('keeps a reminder the user added beside the tagged one', async () => {
		const task = filledTask(alarmLines(at(22, 9)))
		await actions.undoFill(makeContext(task), { task })
		expect(reminderTimes(task)).toEqual([at(22, 9)])
	})

	it('removes the title rather than leaving it empty when there was none', async () => {
		const task = makeTask(['SUMMARY:Untitled',
			'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:',
			`DUE:${utc(at(23, 15))}`,
			...alarmLines(at(23, 15), true)])
		await actions.undoFill(makeContext(task), { task })
		expect(task.vtodo.hasProperty('summary')).toBe(false)
		expect(task.summary).toBe('')
	})

	it('does nothing to a task without the marks', async () => {
		const task = makeTask(['SUMMARY:Plain', `DUE:${utc(at(23, 15))}`, ...alarmLines(at(23, 15), true)])
		const context = makeContext(task)
		await actions.undoFill(context, { task })
		expect(task.summary).toBe('Plain')
		expect(task.alarms).toHaveLength(1)
		expect(context.dispatched).toEqual([])
	})

	it('does nothing to a read-only task', async () => {
		const calendar = { readOnly: true }
		const task = makeTask(['SUMMARY:Pick up milk', `X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:${SENTENCE}`,
			'X-NEXTCLOUD-TASKS-FILLED:LOCATION', 'LOCATION:the store'], calendar)
		await actions.undoFill(makeContext(task), { task })
		expect(task.summary).toBe('Pick up milk')
		expect(task.location).toBe('the store')
	})
})

describe('store/tasks - changing by hand accepts what was filled in', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('when the title is changed', async () => {
		const task = filledTask()
		await actions.setSummary(makeContext(task), { task, summary: 'Milk and eggs' })
		expect(hasMarks(task)).toBe(false)
	})

	it('not when the title is saved unchanged', async () => {
		const task = filledTask()
		await actions.setSummary(makeContext(task), { task, summary: task.summary })
		expect(hasMarks(task)).toBe(true)
	})

	it('when the due date is set', async () => {
		const task = filledTask()
		await actions.setDue(makeContext(task), { task, due: moment(at(24, 16)), allDay: false })
		expect(hasMarks(task)).toBe(false)
	})

	it('when the task is dragged to another day', async () => {
		const task = filledTask()
		await actions.setDate(makeContext(task), { task, day: 3 })
		expect(hasMarks(task)).toBe(false)
	})

	it('when a start date pushes the due date along', async () => {
		const task = filledTask()
		await actions.setStart(makeContext(task), { task, start: moment(at(25, 9)), allDay: false })
		expect(hasMarks(task)).toBe(false)
	})

	it('when the place is changed', async () => {
		const task = filledTask()
		await actions.setLocation(makeContext(task), { task, location: 'the corner shop' })
		expect(hasMarks(task)).toBe(false)
	})

	it('when all-day is toggled', async () => {
		const task = filledTask()
		await actions.toggleAllDay(makeContext(task), task)
		expect(hasMarks(task)).toBe(false)
	})

	it('when the task is made to repeat', async () => {
		const task = filledTask()
		await actions.setRecurrenceRule(makeContext(task), { task, recurrenceRule: { frequency: 'WEEKLY', interval: 1 } })
		expect(hasMarks(task)).toBe(false)
	})
})
