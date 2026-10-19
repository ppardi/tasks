/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The store sets, moves and removes the automatic reminder with the due date
 * (docs/TASK-PANEL-DESIGN.md, "Automatic reminder rules").
 */

import tasksStore from '../../../../src/store/tasks.js'
import Task from '../../../../src/models/task.js'
import { fixedReminders, fixedTrigger } from '../../../../src/utils/reminders.js'

import moment from '@nextcloud/moment'
import ICAL from 'ical.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { actions, mutations } = tasksStore

// Wednesday, 21 October 2026, 2:30 PM local
const NOW = new Date(2026, 9, 21, 14, 30)
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)
const ical = date => ICAL.Time.fromJSDate(date, false).toICALString()

/**
 * @param {string[]} lines Extra VTODO lines
 * @param {object} calendarProps Calendar overrides
 * @return {Task}
 */
function makeTask(lines = [], calendarProps = {}) {
	const calendar = { id: 'cal', tasks: {}, readOnly: false, isSharedWithMe: false, ...calendarProps }
	const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
		'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:Call the bank', ...lines,
		'END:VTODO', 'END:VCALENDAR'].join('\r\n')
	const task = new Task(ics, calendar)
	calendar.tasks[task.uid] = task
	return task
}

const fixedAlarmLines = date => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder',
	`TRIGGER;VALUE=DATE-TIME:${ICAL.Time.fromJSDate(date, true).toICALString()}`, 'END:VALARM']

const reminderTimes = task => fixedReminders(task.alarms).map(r => r.at)

/**
 * A store context applying real mutations; saves are recorded, not sent.
 *
 * @param {object} task The task getters return
 * @return {object}
 */
function makeContext(task) {
	const context = {
		state: { tasks: {} },
		rootState: { settings: { settings: { allDay: 0 } } },
		getters: { getParentTask: () => null, getTaskByUri: () => task, getTaskByUid: () => null },
		// Bookkeeping mutations of other store modules (e.g. addTaskToCalendar) are not under test
		commit: (name, payload) => mutations[name]?.(context.state, payload),
		saved: 0,
		dispatch: async (name, payload) => {
			if (name === 'updateTask') {
				context.saved++
			} else if (actions[name] && !['appendTaskToCalendar', 'setSetting'].includes(name)) {
				return actions[name](context, payload)
			}
		},
	}
	return context
}

describe('store/tasks - automatic reminder', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('adds a reminder at the due time when a due date is set on a task without one', async () => {
		const task = makeTask()
		const result = await actions.setDue(makeContext(task), { task, due: moment(at(23, 16)), allDay: false })
		expect(reminderTimes(task)).toEqual([at(23, 16)])
		expect(result).toEqual({ added: at(23, 16), removed: [] })
	})

	it('adds it at 9:00 AM on the day for an all-day due date', async () => {
		const task = makeTask()
		await actions.setDue(makeContext(task), { task, due: moment(at(23)), allDay: true })
		expect(reminderTimes(task)).toEqual([at(23, 9)])
	})

	it('adds nothing when the task already had a due date', async () => {
		const task = makeTask([`DUE:${ical(at(22, 10))}`])
		await actions.setDue(makeContext(task), { task, due: moment(at(23, 16)), allDay: false })
		expect(task.alarms).toHaveLength(0)
	})

	it('adds nothing when the task already has a reminder', async () => {
		const task = makeTask(fixedAlarmLines(at(22, 8)))
		await actions.setDue(makeContext(task), { task, due: moment(at(23, 16)), allDay: false })
		expect(reminderTimes(task)).toEqual([at(22, 8)])
	})

	it('adds nothing when the reminder would already be past', async () => {
		const task = makeTask()
		await actions.setDue(makeContext(task), { task, due: moment(at(21, 10)), allDay: false })
		expect(task.alarms).toHaveLength(0)
	})

	it('moves only the automatic reminder when the due date moves', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16)), ...fixedAlarmLines(at(22, 8))])
		await actions.setDue(makeContext(task), { task, due: moment(at(24, 11)), allDay: false })
		expect(reminderTimes(task)).toEqual([at(24, 11), at(22, 8)])
	})

	it('removes only the automatic reminder when the due date is cleared, and says so', async () => {
		const relative = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER;RELATED=END:-PT1H', 'END:VALARM']
		const task = makeTask([`DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16)), ...fixedAlarmLines(at(22, 8)), ...relative])
		const result = await actions.setDue(makeContext(task), { task, due: null, allDay: false })
		expect(reminderTimes(task)).toEqual([at(22, 8)])
		expect(task.alarms).toHaveLength(2)
		expect(result).toEqual({ added: null, removed: [at(23, 16)] })
	})

	it('moves the automatic reminder to 9:00 AM when All day is switched on', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16))])
		await actions.toggleAllDay(makeContext(task), task)
		expect(task.allDay).toBe(true)
		expect(reminderTimes(task)).toEqual([at(23, 9)])
	})

	it('sets the due time to 9:00 AM when All day is switched off, keeping the reminder at it', async () => {
		const task = makeTask(['DUE;VALUE=DATE:20261023', ...fixedAlarmLines(at(23, 9))])
		await actions.toggleAllDay(makeContext(task), task)
		expect(task.allDay).toBe(false)
		expect(task.dueMoment.toDate()).toEqual(at(23, 9))
		expect(reminderTimes(task)).toEqual([at(23, 9)])
	})

	it('moves the automatic reminder with a repeating task to its next occurrence', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, 'RRULE:FREQ=DAILY', ...fixedAlarmLines(at(23, 16))])
		await actions.handleRecurringTaskCompletion(makeContext(task), { task })
		expect(task.dueMoment.toDate()).toEqual(at(24, 16))
		expect(reminderTimes(task)).toEqual([at(24, 16)])
	})

	it('writes nothing to a read-only list', async () => {
		const task = makeTask([], { readOnly: true })
		await actions.setDue(makeContext(task), { task, due: moment(at(23, 16)), allDay: false })
		expect(task.alarms).toHaveLength(0)
	})

	it('undo goes by time, so it never removes a reminder the user put in its place', async () => {
		const task = makeTask()
		const context = makeContext(task)
		const result = await actions.setDue(context, { task, due: moment(at(23, 16)), allDay: false })
		// The user removes the automatic reminder and adds their own, which now sits at index 0
		mutations.removeAlarm(context.state, { task, indexes: [0] })
		mutations.addAlarm(context.state, { task, alarm: { action: 'DISPLAY', description: 'Reminder', trigger: fixedTrigger(at(20, 8)) } })
		await actions.undoReminderChange(context, { task, ...result })
		expect(reminderTimes(task)).toEqual([at(20, 8)])
	})

	it('writes nothing to a list shared with the user when the task is not public', async () => {
		const task = makeTask(['CLASS:PRIVATE'], { isSharedWithMe: true })
		await actions.setDue(makeContext(task), { task, due: moment(at(23, 16)), allDay: false })
		expect(task.alarms).toHaveLength(0)
	})

	it('moves the automatic reminder when the task is dragged to another day', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16))])
		await actions.setDate(makeContext(task), { task, day: 4 })
		expect(task.dueMoment.toDate()).toEqual(at(25, 16))
		expect(reminderTimes(task)).toEqual([at(25, 16)])
	})

	it('moves the automatic reminder when a later start date pushes the due date', async () => {
		const task = makeTask([`DTSTART:${ical(at(22, 16))}`, `DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16))])
		await actions.setStart(makeContext(task), { task, start: moment(at(25, 16)), allDay: false })
		expect(task.dueMoment.toDate()).toEqual(at(26, 16))
		expect(reminderTimes(task)).toEqual([at(26, 16)])
	})

	it('carries every fixed reminder of a repeating task to the next occurrence', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, 'RRULE:FREQ=DAILY', ...fixedAlarmLines(at(23, 15))])
		await actions.handleRecurringTaskCompletion(makeContext(task), { task })
		expect(reminderTimes(task)).toEqual([at(24, 15)])
	})

	it('undo puts back a reminder removed with the due date', async () => {
		const task = makeTask([`DUE:${ical(at(23, 16))}`, ...fixedAlarmLines(at(23, 16))])
		const context = makeContext(task)
		const result = await actions.setDue(context, { task, due: null, allDay: false })
		await actions.undoReminderChange(context, { task, ...result })
		expect(reminderTimes(task)).toEqual([at(23, 16)])
	})
})

describe('store/tasks - quick-add from the Today and Week lists', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	const create = async () => {
		const calendar = { id: 'cal', tasks: {}, readOnly: false, dav: { createVObject: async () => ({}) } }
		const context = makeContext(null)
		return actions.createTask(context, { summary: 'Order cards', calendar, due: moment(at(21)).format('YYYY-MM-DDTHH:mm:ss') })
	}

	it('reminds at 9:00 AM on a task due today at midnight', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 8))
		const task = await create()
		expect(reminderTimes(task)).toEqual([at(21, 9)])
	})

	it('adds none once 9:00 AM has passed', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 10))
		const task = await create()
		expect(task.alarms).toHaveLength(0)
	})
})
