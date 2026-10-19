/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Completing the last open subtask completes its parent, all the way up.
 */

import tasksStore from '../../../../src/store/tasks.js'
import Task from '../../../../src/models/task.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { actions, mutations } = tasksStore

const ics = (uid, related = null, status = null) => [
	'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
	`UID:${uid}`, 'DTSTAMP:20261019T120000Z', `SUMMARY:${uid}`,
	...(related ? [`RELATED-TO:${related}`] : []),
	...(status ? [`STATUS:${status}`] : []),
	'END:VTODO', 'END:VCALENDAR',
].join('\r\n')

/**
 * Builds a calendar of tasks, wiring each subtask into its parent as the store does.
 *
 * @param {Array<Array>} specs [uid, parentUid, status] for each task
 * @return {object} The tasks by uid
 */
function buildTasks(specs) {
	const calendar = { id: 'cal', tasks: {} }
	for (const [uid, related, status] of specs) {
		calendar.tasks[uid] = new Task(ics(uid, related, status), calendar)
	}
	for (const task of Object.values(calendar.tasks)) {
		if (task.related) {
			calendar.tasks[task.related].subTasks[task.uid] = task
		}
	}
	return calendar.tasks
}

/**
 * A store context that runs setPercentComplete for real, recursion included,
 * and records saves without a server.
 *
 * @return {object}
 */
function makeContext() {
	const context = {
		state: {},
		getters: {
			getParentTask: task => Object.values(task.calendar.tasks).find(t => t.uid === task.related) || null,
		},
		commit: (name, payload) => mutations[name](context.state, payload),
		saved: [],
		dispatch: async (name, payload) => {
			if (name === 'setPercentComplete') {
				return actions.setPercentComplete(context, payload)
			}
			if (name === 'updateTask') {
				context.saved.push(payload.uid)
			}
		},
	}
	return context
}

describe('store/tasks - the last subtask completes its parent', () => {
	let context

	beforeEach(() => {
		vi.useFakeTimers()
		context = makeContext()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('leaves the parent open while a subtask is still open', async () => {
		const t = buildTasks([['parent'], ['a', 'parent'], ['b', 'parent']])
		await actions.setPercentComplete(context, { task: t.a, complete: 100 })
		expect(t.a.completed).toBe(true)
		expect(t.parent.completed).toBe(false)
	})

	it('completes the parent when the last open subtask is completed', async () => {
		const t = buildTasks([['parent'], ['a', 'parent'], ['b', 'parent']])
		await actions.setPercentComplete(context, { task: t.a, complete: 100 })
		await actions.setPercentComplete(context, { task: t.b, complete: 100 })
		expect(t.parent.completed).toBe(true)
		expect(context.saved).toContain('parent')
	})

	it('counts a cancelled subtask as closed', async () => {
		const t = buildTasks([['parent'], ['a', 'parent', 'CANCELLED'], ['b', 'parent']])
		await actions.setPercentComplete(context, { task: t.b, complete: 100 })
		expect(t.parent.completed).toBe(true)
	})

	it('carries on up through grandparents', async () => {
		const t = buildTasks([['top'], ['mid', 'top'], ['leaf', 'mid']])
		await actions.setPercentComplete(context, { task: t.leaf, complete: 100 })
		expect(t.mid.completed).toBe(true)
		expect(t.top.completed).toBe(true)
	})

	it('saves the parent once when the parent itself is checked off', async () => {
		const t = buildTasks([['parent'], ['a', 'parent'], ['b', 'parent']])
		await actions.setPercentComplete(context, { task: t.parent, complete: 100 })
		expect([t.parent, t.a, t.b].every(task => task.completed)).toBe(true)
		expect(context.saved.filter(uid => uid === 'parent')).toHaveLength(1)
	})

	it('reopens the parent when a subtask is reopened, as before', async () => {
		const t = buildTasks([['parent'], ['a', 'parent']])
		await actions.setPercentComplete(context, { task: t.a, complete: 100 })
		expect(t.parent.completed).toBe(true)
		await actions.setPercentComplete(context, { task: t.a, complete: 0 })
		expect(t.parent.completed).toBe(false)
	})
})
