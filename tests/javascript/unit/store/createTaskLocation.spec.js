/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A task created with a place carries it, and a duplicate does not inherit
 * the marks the server left when it read the original on arrival.
 */

import tasksStore from '../../../../src/store/tasks.js'
import Task from '../../../../src/models/task.js'

import { describe, expect, it, vi } from 'vitest'

const { actions } = tasksStore

/**
 * @param {string[]} lines Extra VTODO lines
 * @return {{calendar: object, sent: string[], task: Task}}
 */
function setup(lines = []) {
	const sent = []
	const calendar = {
		id: 'cal',
		tasks: {},
		readOnly: false,
		isSharedWithMe: false,
		dav: { createVObject: vi.fn(async (data) => { sent.push(data); return { url: 'x' } }) },
	}
	const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
		'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:Buy milk', ...lines,
		'END:VTODO', 'END:VCALENDAR'].join('\r\n')
	const task = new Task(ics, calendar)
	return { calendar, sent, task }
}

const makeContext = () => ({
	getters: {
		getParentTask: () => null,
		getTaskByUid: () => null,
		getDefaultCalendar: null,
	},
	commit: () => {},
	dispatch: async () => {},
	rootState: { settings: { settings: { allDay: 0 } } },
})

describe('store/tasks - createTask location', () => {
	it('sends the location it is given', async () => {
		const { calendar, sent } = setup()
		await actions.createTask(makeContext(), { summary: 'Buy milk', calendar, location: 'grocery store' })
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('LOCATION:grocery store')
	})
})

describe('store/tasks - duplicateTask arrival marks', () => {
	it('drops ORIGINAL-SUMMARY and FILLED from the copy', async () => {
		const { sent, task } = setup([
			'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY:Buy milk tomorrow',
			'X-NEXTCLOUD-TASKS-FILLED:DUE',
		])
		await actions.duplicateTask(makeContext(), task)
		expect(sent).toHaveLength(1)
		expect(sent[0]).not.toMatch(/ORIGINAL-SUMMARY/i)
		expect(sent[0]).not.toMatch(/FILLED/i)
		expect(sent[0]).toContain('SUMMARY:Buy milk')
	})

	it('gives the copy no Undo line, and leaves the source its marks', async () => {
		const { task } = setup([
			'X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY:Buy milk tomorrow',
			'X-NEXTCLOUD-TASKS-FILLED:DUE',
		])
		const copy = await actions.duplicateTask(makeContext(), task)
		expect(copy).not.toBeNull()
		expect(copy.originalSummary).toBeNull()
		expect(copy.filledFields).toEqual([])
		expect(task.originalSummary).toBe('Buy milk tomorrow')
		expect(task.filledFields).toEqual(['DUE'])
	})
})
