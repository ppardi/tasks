/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import TaskPills from '../../../../src/components/AppSidebar/Pills/TaskPills.vue'
import Task from '../../../../src/models/task.js'

import ICAL from 'ical.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { showUndo } from '@nextcloud/dialogs'
import { toRaw } from 'vue'

vi.mock('@nextcloud/dialogs', () => ({ showUndo: vi.fn() }))

// Wednesday, 21 October 2026, 2:30 PM local
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)
const local = date => ICAL.Time.fromJSDate(date, false).toICALString()
const fixedAlarm = date => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder',
	`TRIGGER;VALUE=DATE-TIME:${ICAL.Time.fromJSDate(date, true).toICALString()}`, 'END:VALARM']

const makeTask = (lines = []) => new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
	'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:Call the bank', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'),
{ id: 'cal', readOnly: false, tasks: {} })

/**
 * @param {Task} task The task
 * @param {boolean} readOnly Whether it is read-only
 * @return {object} The wrapper and the recorded dispatches
 */
function mountPills(task, readOnly = false) {
	const dispatched = []
	const $store = {
		dispatch: (name, payload) => { dispatched.push({ name, payload }); return Promise.resolve({ added: null, removed: [] }) },
		getters: { tags: ['Bank', 'Talk'] },
	}
	const wrapper = mount(TaskPills, {
		props: { task, readOnly },
		global: {
			mocks: { $store },
			stubs: { NcPopover: { props: ['shown'], template: '<div class="popover-stub"><slot name="trigger" /><slot v-if="shown" /></div>' } },
		},
	})
	return { wrapper, dispatched }
}

const pillTexts = wrapper => wrapper.findAll('.pill').map(pill => pill.find('.pill__text').text())

describe('TaskPills.vue', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 14, 30))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('shows due date, each reminder, repeat and each tag, in that order', () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`, 'CATEGORIES:Bank', ...fixedAlarm(at(23, 16)), ...fixedAlarm(at(22, 8))])
		const { wrapper } = mountPills(task)
		expect(pillTexts(wrapper)).toEqual(['Fri, 4:00 PM', 'At due time', 'Tomorrow, 8:00 AM', 'Reminder', 'Repeat', 'Bank', 'Tag'])
	})

	it('names unset pills in gray and hides Repeat without a date', () => {
		const { wrapper } = mountPills(makeTask())
		expect(pillTexts(wrapper)).toEqual(['Due date', 'Reminder', 'Add tag'])
		expect(wrapper.findAll('.pill--set')).toHaveLength(0)
	})

	it('marks an overdue due date', () => {
		const { wrapper } = mountPills(makeTask([`DUE:${local(at(20, 16))}`]))
		expect(wrapper.find('.pill--late').exists()).toBe(true)
	})

	it('shows only set pills on a read-only task, and none of them opens a picker', async () => {
		const { wrapper } = mountPills(makeTask(['CATEGORIES:Bank']), true)
		expect(pillTexts(wrapper)).toEqual(['Bank'])
		await wrapper.find('.pill__main').trigger('click')
		expect(wrapper.find('.picker').exists()).toBe(false)
		expect(wrapper.find('.pill__clear').exists()).toBe(false)
	})

	it('undoes on the task it announced, even after another task was opened', async () => {
		const taskA = makeTask([`DUE:${local(at(23, 16))}`])
		const taskB = makeTask()
		const { wrapper, dispatched } = mountPills(taskA)
		wrapper.vm.announce({ added: null, removed: [at(23, 16)] })
		await wrapper.setProps({ task: taskB })
		const undo = showUndo.mock.calls.at(-1)[1]
		undo()
		expect(dispatched.at(-1).name).toBe('undoReminderChange')
		// Props come back reactive; compare the task underneath
		expect(toRaw(dispatched.at(-1).payload.task)).toBe(taskA)
	})

	it('clears the due date from its pill', async () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`])
		const { wrapper, dispatched } = mountPills(task)
		await wrapper.find('.pill--due .pill__clear').trigger('click')
		expect(dispatched[0]).toEqual({ name: 'setDue', payload: { task, due: null, allDay: false } })
	})
})
