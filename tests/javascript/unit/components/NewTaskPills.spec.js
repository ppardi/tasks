/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import DuePicker from '../../../../src/components/AppSidebar/Pills/DuePicker.vue'
import NewTaskPills from '../../../../src/components/NewTaskPills.vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Wednesday, 21 October 2026, 2:30 PM local
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)

const milk = { due: '2026-10-22T18:00:00', allDay: false, place: 'grocery store', title: 'Purchase milk at the grocery store' }

/**
 * @param {object} props The pills' props
 * @return {object} The wrapper
 */
function mountPills(props) {
	return mount(NewTaskPills, {
		props,
		global: {
			stubs: { NcPopover: { props: ['shown'], template: '<div class="popover-stub"><slot name="trigger" /><slot v-if="shown" /></div>' } },
		},
	})
}

const pills = wrapper => wrapper.findAll('.pill')
const pillTexts = wrapper => pills(wrapper).map(pill => pill.find('.pill__text').text())
const clickOption = (wrapper, text) => wrapper.findAll('.picker__option').find(o => o.text().startsWith(text)).trigger('click')

describe('NewTaskPills.vue', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 14, 30))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('shows the date as the panel labels it, then the place', () => {
		const wrapper = mountPills(milk)
		expect(pillTexts(wrapper)).toEqual(['Tomorrow, 6:00 PM', 'grocery store'])
		expect(mountPills({ ...milk, due: '2026-10-23T00:00:00', allDay: true, place: null }).find('.pill__text').text()).toBe('Fri, Oct 23')
	})

	it('shows nothing when nothing was read', () => {
		const wrapper = mountPills({ due: null, allDay: false, place: null, title: 'Renew passport' })
		expect(pills(wrapper)).toHaveLength(0)
		expect(wrapper.text()).toBe('')
	})

	it('says what will be saved', () => {
		const wrapper = mountPills(milk)
		expect(wrapper.find('.new-task-pills__hint').text()).toBe('Saved as “Purchase milk at the grocery store” · Enter to add')
		expect(wrapper.find('.new-task-pills__hint strong').text()).toBe('Purchase milk at the grocery store')
	})

	it('dismisses a guess from its ×', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[0].find('.pill__clear').trigger('click')
		await pills(wrapper)[1].find('.pill__clear').trigger('click')
		expect(wrapper.emitted('dismiss')).toEqual([['date'], ['place']])
	})

	it('changes the place in a text field', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[1].find('.pill__main').trigger('click')
		const input = wrapper.find('input[type="text"]')
		expect(input.element.value).toBe('grocery store')
		await input.setValue(' grocery ')
		await wrapper.findAll('button').find(b => b.text() === 'Done').trigger('click')
		expect(wrapper.emitted('edit')).toEqual([[{ place: 'grocery' }]])
		expect(wrapper.find('input[type="text"]').exists()).toBe(false)
	})

	it('takes an emptied place as "not a place"', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[1].find('.pill__main').trigger('click')
		await wrapper.find('input[type="text"]').setValue('')
		await wrapper.find('form').trigger('submit')
		expect(wrapper.emitted('dismiss')).toEqual([['place']])
	})

	it('changes the date in the panel\'s due picker, without a task', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[0].find('.pill__main').trigger('click')
		const picker = wrapper.findComponent(DuePicker)
		expect(picker.props('task')).toBeNull()
		await clickOption(wrapper, 'Next week')
		expect(wrapper.emitted('edit')).toEqual([[{ date: { due: '2026-10-26T18:00:00', allDay: false } }]])
	})

	it('makes a changed date all day from the picker\'s checkbox', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[0].find('.pill__main').trigger('click')
		await wrapper.find('input[type="checkbox"]').setValue(true)
		expect(wrapper.find('input[type="time"]').exists()).toBe(false)
		await wrapper.find('input[type="date"]').setValue('2026-10-30')
		await clickOption(wrapper, 'Set')
		expect(wrapper.emitted('edit')).toEqual([[{ date: { due: '2026-10-30T00:00:00', allDay: true } }]])
	})

	it('takes "No due date" as "not a date"', async () => {
		const wrapper = mountPills(milk)
		await pills(wrapper)[0].find('.pill__main').trigger('click')
		await clickOption(wrapper, 'No due date')
		expect(wrapper.emitted('dismiss')).toEqual([['date']])
	})
})
