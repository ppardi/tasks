/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import FilledLine from '../../../../src/components/AppSidebar/FilledLine.vue'
import Task from '../../../../src/models/task.js'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

const makeTask = (lines = []) => new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
	'UID:t1', 'DTSTAMP:20261021T120000Z', 'SUMMARY:Pick up milk', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'),
{ id: 'cal', readOnly: false, tasks: {} })

const MARKS = ['X-NEXTCLOUD-TASKS-ORIGINAL-SUMMARY;VALUE=TEXT:Pick up milk tomorrow', 'X-NEXTCLOUD-TASKS-FILLED:DUE', 'DUE:20261022T090000Z']

/**
 * @param {Task} task The task
 * @param {boolean} readOnly Whether it is read-only
 * @return {object} The wrapper and the recorded dispatches
 */
function mountLine(task, readOnly = false) {
	const dispatched = []
	const $store = { dispatch: (name, payload) => { dispatched.push({ name, payload }); return Promise.resolve() } }
	const wrapper = mount(FilledLine, { props: { task, readOnly }, global: { mocks: { $store } } })
	return { wrapper, dispatched }
}

describe('FilledLine.vue', () => {
	it('says the task was filled in from its title and offers Undo', async () => {
		const task = makeTask(MARKS)
		const { wrapper, dispatched } = mountLine(task)
		expect(wrapper.find('.filled-line').text()).toBe('Filled in from the title · Undo')
		const button = wrapper.find('button.filled-line__undo')
		expect(button.exists()).toBe(true)
		await button.trigger('click')
		expect(dispatched).toEqual([{ name: 'undoFill', payload: { task } }])
	})

	it('is not shown for a task without the marks', () => {
		expect(mountLine(makeTask()).wrapper.find('.filled-line').exists()).toBe(false)
	})

	it('is not shown for a repeating task', () => {
		const { wrapper } = mountLine(makeTask([...MARKS, 'RRULE:FREQ=DAILY']))
		expect(wrapper.find('.filled-line').exists()).toBe(false)
	})

	it('offers no Undo when the task cannot be changed', () => {
		const { wrapper } = mountLine(makeTask(MARKS), true)
		expect(wrapper.find('.filled-line').text()).toBe('Filled in from the title')
		expect(wrapper.find('button').exists()).toBe(false)
	})
})
