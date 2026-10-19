/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A just-completed task stays in the open list for LINGER_MS, as in Apple
 * Reminders, while the completion itself is saved at once.
 */

import tasksStore, { LINGER_MS } from '../../../../src/store/tasks.js'
import { isTaskInList, sort } from '../../../../src/store/storeHelper.js'
import Task from '../../../../src/models/task.js'

import { loadICS } from '../../../assets/loadAsset.js'

import ICAL from 'ical.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { actions, getters, mutations } = tasksStore

const openRoots = tasks => getters.findOpenRootTasks()(tasks)
const closedRoots = tasks => getters.findClosedRootTasks()(tasks)

/**
 * A store context that applies mutations for real and records dispatches,
 * so `updateTask` (the save) can be observed without a server.
 *
 * @return {object}
 */
function makeContext() {
	const context = {
		state: {},
		getters: { getParentTask: () => null },
		commit: (name, payload) => mutations[name](context.state, payload),
		dispatch: vi.fn(),
	}
	return context
}

describe('store/tasks - a completed task lingers in the open list', () => {
	let task, tasks, context

	beforeEach(() => {
		vi.useFakeTimers()
		task = new Task(loadICS('vcalendars/vcalendar-default'), { id: 'cal' })
		tasks = { [task.uid]: task }
		context = makeContext()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('saves at once but stays listed as open until the wait is over', async () => {
		await actions.setPercentComplete(context, { task, complete: 100 })

		expect(task.completed).toBe(true)
		expect(context.dispatch).toHaveBeenCalledWith('updateTask', task)
		expect(openRoots(tasks)).toEqual([task])
		expect(closedRoots(tasks)).toEqual([])
		expect(isTaskInList(task, 'all')).toBe(true)

		vi.advanceTimersByTime(LINGER_MS - 1)
		expect(openRoots(tasks)).toEqual([task])

		vi.advanceTimersByTime(1)
		expect(openRoots(tasks)).toEqual([])
		expect(closedRoots(tasks)).toEqual([task])
		expect(isTaskInList(task, 'all')).toBe(false)
		expect(isTaskInList(task, 'completed')).toBe(true)
	})

	it('stays open, for good, when unchecked during the wait', async () => {
		await actions.setPercentComplete(context, { task, complete: 100 })
		vi.advanceTimersByTime(2000)
		await actions.setPercentComplete(context, { task, complete: 0 })

		expect(task.completed).toBe(false)
		expect(task.lingering).toBe(false)
		vi.advanceTimersByTime(LINGER_MS)
		expect(openRoots(tasks)).toEqual([task])
	})

	it('restarts the wait when checked again', async () => {
		await actions.setPercentComplete(context, { task, complete: 100 })
		vi.advanceTimersByTime(3000)
		await actions.setPercentComplete(context, { task, complete: 0 })
		await actions.setPercentComplete(context, { task, complete: 100 })

		// The first timer would have fired here; the task must still be shown
		vi.advanceTimersByTime(3000)
		expect(openRoots(tasks)).toEqual([task])

		vi.advanceTimersByTime(LINGER_MS - 3000)
		expect(closedRoots(tasks)).toEqual([task])
	})

	it('never writes the flag into the calendar data', async () => {
		await actions.setPercentComplete(context, { task, complete: 100 })
		expect(task.vCalendar.toString()).not.toMatch(/linger/i)
	})
})

describe('storeHelper - sort keeps a lingering task in place', () => {
	it('does not move a just-completed task to the end of the list', () => {
		const make = (summary, due) => {
			const task = new Task(loadICS('vcalendars/vcalendar-default'), { id: 'cal' })
			task.summary = summary
			task.due = ICAL.Time.fromDateString(due)
			return task
		}
		const first = make('first', '2026-11-01')
		const middle = make('middle', '2026-11-02')
		const last = make('last', '2026-11-03')
		middle.completed = true
		middle.lingering = true

		expect(sort([last, middle, first], 'default', 0).map(t => t.summary))
			.toEqual(['first', 'middle', 'last'])

		middle.lingering = false
		expect(sort([last, middle, first], 'default', 0).map(t => t.summary))
			.toEqual(['first', 'last', 'middle'])
	})
})
