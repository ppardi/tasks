/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The nightly rollover marks a task with X- properties; changing its date by
 * hand is a new plan, so the marks go (docs/ROLLOVER-DESIGN.md).
 */

import tasksStore from '../../../../src/store/tasks.js'
import Task from '../../../../src/models/task.js'
import { fixedTrigger } from '../../../../src/utils/reminders.js'

import moment from '@nextcloud/moment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { actions, mutations } = tasksStore
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)

const makeTask = (lines = []) => {
	const calendar = { id: 'cal', tasks: {}, readOnly: false, isSharedWithMe: false }
	const task = new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
		'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:x', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'), calendar)
	calendar.tasks[task.uid] = task
	return task
}

const makeContext = task => {
	const context = {
		state: {},
		rootState: { settings: { settings: { allDay: 0 } } },
		getters: { getParentTask: () => null, getTaskByUri: () => task },
		commit: (name, payload) => mutations[name]?.(context.state, payload),
		dispatch: async (name, payload) => (name === 'updateTask' || name === 'appendTaskToCalendar') ? undefined : actions[name]?.(context, payload),
	}
	return context
}

describe('models/task - rollover marks', () => {
	it('reads the original due date, the original reminder and the missed count', () => {
		const task = makeTask(['DUE:20261021T230000Z', 'X-NEXTCLOUD-TASKS-ORIGINAL-DUE:20261018T230000Z', 'X-NEXTCLOUD-TASKS-MISSED:2'])
		expect(task.originalDue).toEqual(new Date(Date.UTC(2026, 9, 18, 23, 0)))
		expect(task.missedCount).toBe(2)
		expect(makeTask(['X-NEXTCLOUD-TASKS-ORIGINAL-DUE;VALUE=DATE:20261018']).originalDue).toEqual(at(18))
		expect(makeTask(['X-NEXTCLOUD-TASKS-ORIGINAL-REMINDER:20261019T160000Z']).originalReminder).toEqual(new Date(Date.UTC(2026, 9, 19, 16, 0)))
		expect(makeTask().originalDue).toBeNull()
		expect(makeTask().missedCount).toBe(0)
	})
})

describe('store/tasks - a date changed by hand clears the rollover marks', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 14, 30))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	const rolled = () => makeTask(['DUE:20261021T230000Z', 'X-NEXTCLOUD-TASKS-ORIGINAL-DUE:20261018T230000Z', 'X-NEXTCLOUD-TASKS-MISSED:1'])

	it('when the due date is set', async () => {
		const task = rolled()
		await actions.setDue(makeContext(task), { task, due: moment(at(24, 16)), allDay: false })
		expect(task.originalDue).toBeNull()
		expect(task.missedCount).toBe(0)
	})

	it('when the task is dragged to another day', async () => {
		const task = rolled()
		await actions.setDate(makeContext(task), { task, day: 3 })
		expect(task.originalDue).toBeNull()
	})

	it('when a reminder-only task gets its reminder changed', async () => {
		const task = makeTask(['X-NEXTCLOUD-TASKS-ORIGINAL-REMINDER:20261019T160000Z',
			'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:R', 'TRIGGER;VALUE=DATE-TIME:20261021T160000Z', 'END:VALARM'])
		await actions.addAlarm(makeContext(task), { task, alarm: { action: 'DISPLAY', description: 'R', trigger: fixedTrigger(at(25, 9)) } })
		expect(task.originalReminder).toBeNull()
	})

	it('but not when the task merely changes its title', async () => {
		const task = rolled()
		task.summary = 'Renamed'
		expect(task.originalDue).not.toBeNull()
	})

	it('when a repeating task is completed', async () => {
		const task = makeTask(['DUE:20261019T160000Z', 'RRULE:FREQ=WEEKLY', 'X-NEXTCLOUD-TASKS-MISSED:2'])
		await actions.handleRecurringTaskCompletion(makeContext(task), { task })
		expect(task.missedCount).toBe(0)
	})
})
