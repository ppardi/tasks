/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import DuePicker from '../../../../src/components/AppSidebar/Pills/DuePicker.vue'
import ReminderPicker from '../../../../src/components/AppSidebar/Pills/ReminderPicker.vue'
import RepeatPicker from '../../../../src/components/AppSidebar/Pills/RepeatPicker.vue'
import TagsPicker from '../../../../src/components/AppSidebar/Pills/TagsPicker.vue'
import Task from '../../../../src/models/task.js'
import { repeatPreset } from '../../../../src/utils/repeatPresets.js'

import ICAL from 'ical.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Wednesday, 21 October 2026, 2:30 PM local
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)
const local = date => ICAL.Time.fromJSDate(date, false).toICALString()
const fixedAlarm = date => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder',
	`TRIGGER;VALUE=DATE-TIME:${ICAL.Time.fromJSDate(date, true).toICALString()}`, 'END:VALARM']
const makeTask = (lines = []) => new Task(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VTODO',
	'UID:t1', 'DTSTAMP:20261019T120000Z', 'SUMMARY:Call the bank', ...lines, 'END:VTODO', 'END:VCALENDAR'].join('\r\n'),
{ id: 'cal', readOnly: false, tasks: {} })

/**
 * @param {object} component The picker
 * @param {object} props Its props
 * @return {object} The wrapper and the recorded dispatches
 */
function mountPicker(component, props) {
	const dispatched = []
	const $store = {
		dispatch: (name, payload) => { dispatched.push({ name, payload }); return Promise.resolve({ added: null, removed: [] }) },
		getters: { tags: ['Bank', 'Talk'] },
	}
	return { wrapper: mount(component, { props, global: { mocks: { $store } } }), dispatched }
}

const clickOption = (wrapper, text) => wrapper.findAll('.picker__option').find(o => o.text().startsWith(text)).trigger('click')

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(at(21, 14, 30))
})

afterEach(() => {
	vi.useRealTimers()
})

describe('DuePicker.vue', () => {
	it('moves a due date to tomorrow, keeping its time', async () => {
		const task = makeTask([`DUE:${local(at(21, 16))}`])
		const { wrapper, dispatched } = mountPicker(DuePicker, { task })
		await clickOption(wrapper, 'Tomorrow')
		expect(dispatched[0].name).toBe('setDue')
		expect(dispatched[0].payload.due.toDate()).toEqual(at(22, 16))
	})

	it('gives a new due date 9:00 AM', async () => {
		const task = makeTask()
		const { wrapper, dispatched } = mountPicker(DuePicker, { task })
		await clickOption(wrapper, 'Tomorrow')
		expect(dispatched[0].payload.due.toDate()).toEqual(at(22, 9))
	})

	it('takes "This weekend" to mean the coming Saturday', async () => {
		const task = makeTask()
		const { wrapper, dispatched } = mountPicker(DuePicker, { task })
		await clickOption(wrapper, 'This weekend')
		expect(dispatched[0].payload.due.toDate()).toEqual(at(24, 9))
	})

	it('takes "Next week" to mean the coming Monday', async () => {
		const task = makeTask()
		const { wrapper, dispatched } = mountPicker(DuePicker, { task })
		await clickOption(wrapper, 'Next week')
		expect(dispatched[0].payload.due.toDate()).toEqual(at(26, 9))
	})

	it('gives a task with an all-day start an all-day due date, so the two match', async () => {
		const task = makeTask(['DTSTART;VALUE=DATE:20261021'])
		const { wrapper, dispatched } = mountPicker(DuePicker, { task })
		await clickOption(wrapper, 'Tomorrow')
		expect(dispatched[0].payload.allDay).toBe(true)
		expect(dispatched[0].payload.due.toDate()).toEqual(at(22))
	})

	it('reports what the reminder rule did, so the panel can offer Undo', async () => {
		const { wrapper } = mountPicker(DuePicker, { task: makeTask() })
		await clickOption(wrapper, 'Today')
		await Promise.resolve()
		expect(wrapper.emitted('dueChanged')[0][0]).toEqual({ added: null, removed: [] })
	})
})

describe('ReminderPicker.vue', () => {
	it('adds a fixed reminder one hour before the due time', async () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`])
		const { wrapper, dispatched } = mountPicker(ReminderPicker, { task, index: null })
		await clickOption(wrapper, '1 hour before')
		expect(dispatched[0].name).toBe('addAlarm')
		expect(dispatched[0].payload.alarm.trigger.value.toJSDate()).toEqual(at(23, 15))
	})

	it('changes an existing reminder in place', async () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`, ...fixedAlarm(at(23, 16))])
		const { wrapper, dispatched } = mountPicker(ReminderPicker, { task, index: 0 })
		expect(wrapper.find('.picker__option--current').text()).toContain('At due time')
		await clickOption(wrapper, '1 day before')
		expect(dispatched[0].name).toBe('updateAlarm')
		expect(dispatched[0].payload.index).toBe(0)
		expect(dispatched[0].payload.alarm.trigger.value.toJSDate()).toEqual(at(22, 16))
	})

	it('shows a reminder that matches no choice as the current one', () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`, ...fixedAlarm(at(12, 9))])
		const { wrapper } = mountPicker(ReminderPicker, { task, index: 0 })
		expect(wrapper.find('.picker__current').text()).toBe('Current: Mon, Oct 12, 9:00 AM')
	})

	it('offers the full editor as Custom…', async () => {
		const { wrapper } = mountPicker(ReminderPicker, { task: makeTask(), index: null })
		await clickOption(wrapper, 'Custom…')
		expect(wrapper.emitted('custom')).toHaveLength(1)
	})
})

describe('RepeatPicker.vue and repeat presets', () => {
	it('sets Weekdays as weekly on Monday to Friday', async () => {
		const task = makeTask([`DUE:${local(at(23, 16))}`])
		const { wrapper, dispatched } = mountPicker(RepeatPicker, { task })
		await clickOption(wrapper, 'Weekdays')
		expect(dispatched[0]).toEqual({ name: 'setRecurrenceRule', payload: { task, recurrenceRule: { frequency: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] } } })
	})

	it('names the presets back from a parsed rule', () => {
		expect(repeatPreset(makeTask([`DUE:${local(at(23, 16))}`, 'RRULE:FREQ=DAILY']))).toBe('daily')
		expect(repeatPreset(makeTask([`DUE:${local(at(23, 16))}`, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']))).toBe('weekdays')
		expect(repeatPreset(makeTask([`DUE:${local(at(23, 16))}`, 'RRULE:FREQ=WEEKLY']))).toBe('weekly')
		expect(repeatPreset(makeTask([`DUE:${local(at(23, 16))}`, 'RRULE:FREQ=WEEKLY;INTERVAL=2']))).toBe(null)
		expect(repeatPreset(makeTask([`DUE:${local(at(23, 16))}`]))).toBe('never')
	})
})

describe('TagsPicker.vue', () => {
	it('adds a typed tag on Enter', async () => {
		const task = makeTask(['CATEGORIES:Bank'])
		const { wrapper, dispatched } = mountPicker(TagsPicker, { task })
		const input = wrapper.find('input[type=text]')
		await input.setValue('Groceries')
		await input.trigger('keydown', { key: 'Enter' })
		expect(dispatched[0]).toEqual({ name: 'setTags', payload: { task, tags: ['Bank', 'Groceries'] } })
	})

	it('removes a tag when it is unticked', async () => {
		const task = makeTask(['CATEGORIES:Bank'])
		const { wrapper, dispatched } = mountPicker(TagsPicker, { task })
		await wrapper.findAll('input[type=checkbox]')[0].setValue(false)
		expect(dispatched[0]).toEqual({ name: 'setTags', payload: { task, tags: [] } })
	})
})
