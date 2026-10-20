/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import HeaderBar from '../../../../src/components/HeaderBar.vue'
import NewTaskPills from '../../../../src/components/NewTaskPills.vue'
import { taskDataFromEntry } from '../../../../src/utils/newTaskEntry.js'

import axios from '@nextcloud/axios'
import { showError } from '@nextcloud/dialogs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ICAL from 'ical.js'
import { reactive } from 'vue'

vi.mock('@nextcloud/axios', () => ({ default: { post: vi.fn() } }))
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))
vi.mock('../../../../src/utils/newTaskEntry.js', async (importOriginal) => {
	const original = await importOriginal()
	return { ...original, taskDataFromEntry: vi.fn(original.taskDataFromEntry) }
})

// Wednesday, 21 October 2026, 2:30 PM local
const at = (d, h = 0, m = 0) => new Date(2026, 9, d, h, m)
// How the panel stores a timed date: a UTC DATE-TIME
const utc = date => ICAL.Time.fromJSDate(date, true).toICALString()

const list = { id: 'cal', displayName: 'Immediate Tasks', readOnly: false }
const other = { id: 'other', displayName: 'Other', readOnly: false }
const lists = { cal: list, other }

// The endpoint's answers, keyed by text (zone-less local times, as it sends them)
const ANSWERS = {
	'Call the bank tomorrow': { title: 'Call the bank', due: '2026-10-22T00:00:00', allDay: true, location: null, found: true },
	'Dentist Friday at 3': { title: 'Dentist', due: '2026-10-23T15:00:00', allDay: false, location: null, found: true },
	'Renew passport': { title: 'Renew passport', due: null, allDay: false, location: null, found: false },
}

let posts

/**
 * @param {object} options The mount options
 * @param {object} [options.settings] Settings to change
 * @param {object} [options.params] The route's params
 * @param {Function} [options.createTask] What the createTask action does
 * @return {object} The wrapper, its input and the mocks
 */
function mountHeader({ settings = {}, params = { calendarId: 'cal' }, createTask } = {}) {
	const $route = reactive({ params })
	// Opening a task changes the route, as the real router does
	const $router = { push: vi.fn(({ params }) => { $route.params = { ...params }; return Promise.resolve() }) }
	const created = []
	const $store = {
		state: {
			settings: { settings: { parseNewTasks: true, allDay: true, ...settings } },
			collections: { collections: [{ id: 'today', displayName: 'Today' }, { id: 'current', displayName: 'Current' }] },
		},
		getters: { getCalendarByRoute: route => (route.params.collectionId ? list : lists[route.params.calendarId]) },
		dispatch: vi.fn((name, data) => {
			created.push(data)
			return createTask ? createTask(data) : Promise.resolve({ uri: `task-${created.length}.ics` })
		}),
	}
	const wrapper = mount(HeaderBar, {
		attachTo: document.body,
		global: {
			mocks: { $store, $route, $router },
			stubs: { FilterBar: true, FilterDropdown: true, SortorderDropdown: true, CreateMultipleTasksDialog: true },
		},
	})
	return { wrapper, input: wrapper.find('input'), $route, $router, $store, created }
}

const answer = (index = posts.length - 1) => posts[index].resolve()
const enter = (input, init = {}) => input.trigger('keydown', { key: 'Enter', keyCode: 13, ...init })
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('HeaderBar.vue: the New task box', () => {
	let wrapper

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(at(21, 14, 30))
		posts = []
		axios.post.mockReset()
		axios.post.mockImplementation((url, body, { signal }) => new Promise((resolve, reject) => {
			const post = { url, body, signal, resolve: () => resolve({ data: ANSWERS[body.text] }), reject: () => reject(new Error('500')) }
			signal.addEventListener('abort', () => reject(new Error('canceled')))
			posts.push(post)
		}))
		showError.mockReset()
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 1200, configurable: true })
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.useRealTimers()
	})

	it('asks the parser after a pause and shows what it read', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		expect(posts).toHaveLength(1)
		expect(posts[0].url).toMatch(/\/apps\/tasks\/api\/v1\/parse$/)
		expect(posts[0].body).toMatchObject({ text: 'Call the bank tomorrow', ignore: [] })
		answer()
		await flush()
		expect(wrapper.findAll('.pill__text').map(p => p.text())).toEqual(['Tomorrow'])
		expect(wrapper.text()).toContain('Saved as “Call the bank” · Enter to add')
	})

	it('neither asks nor shows pills with the setting off, and saves as typed', async () => {
		const mounted = mountHeader({ settings: { parseNewTasks: false } })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(500)
		expect(axios.post).not.toHaveBeenCalled()
		expect(wrapper.find('.pill').exists()).toBe(false)
		await enter(mounted.input)
		await flush()
		expect(axios.post).not.toHaveBeenCalled()
		expect(mounted.created).toEqual([{ summary: 'Call the bank tomorrow', calendar: list }])
	})

	it('does not ask while an input method is composing', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.trigger('compositionstart')
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(500)
		expect(axios.post).not.toHaveBeenCalled()
		await enter(mounted.input)
		await enter(mounted.input, { isComposing: true })
		await flush()
		expect(mounted.created).toHaveLength(0)

		await mounted.input.trigger('compositionend')
		await enter(mounted.input, { keyCode: 229 })
		await flush()
		expect(mounted.created).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(150)
		expect(posts).toHaveLength(1)
	})

	it('does nothing on Enter in an empty box', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await enter(mounted.input)
		await mounted.input.setValue('   ')
		await enter(mounted.input)
		await vi.advanceTimersByTimeAsync(1500)
		expect(mounted.created).toHaveLength(0)
		expect(axios.post).not.toHaveBeenCalled()
	})

	it('clears the box at once, keeps focus there, and saves exactly what it showed', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		mounted.input.element.focus()
		await enter(mounted.input)
		expect(mounted.input.element.value).toBe('')
		expect(document.activeElement).toBe(mounted.input.element)
		expect(wrapper.find('.pill').exists()).toBe(false)
		await flush()
		expect(posts).toHaveLength(1)
		expect(mounted.created).toEqual([{ summary: 'Call the bank', due: '2026-10-22T00:00:00', allDay: true, calendar: list }])
		expect(mounted.$router.push).toHaveBeenCalledWith({ name: 'calendarsTask', params: { calendarId: 'cal', taskId: 'task-1.ics' } })
	})

	it('saves two quick entries from their own answers, in the order entered', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		await enter(mounted.input)
		await mounted.input.setValue('Dentist Friday at 3')
		await enter(mounted.input)
		expect(posts.map(p => p.body.text)).toEqual(['Call the bank tomorrow', 'Dentist Friday at 3'])
		answer(1)
		await flush()
		expect(mounted.created).toHaveLength(0)
		answer(0)
		await flush()
		expect(mounted.created.map(data => data.summary)).toEqual(['Call the bank', 'Dentist'])
		expect(mounted.created[0]).toEqual({ summary: 'Call the bank', due: '2026-10-22T00:00:00', allDay: true, calendar: list })
		expect(mounted.created[1].due.toICALString()).toBe(utc(at(23, 15)))
	})

	it('stores a timed date in UTC, as the panel does, and an all-day date as a date', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Dentist Friday at 3')
		await enter(mounted.input)
		answer()
		await flush()
		const { due, allDay } = mounted.created[0]
		expect(due).toBeInstanceOf(ICAL.Time)
		expect(due.toICALString()).toBe(utc(at(23, 15)))
		expect(due.toICALString()).toMatch(/Z$/)
		expect(allDay).toBe(false)
	})

	it('stores Current\'s start "now" in UTC too', async () => {
		const mounted = mountHeader({ params: { collectionId: 'current' } })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Renew passport')
		await enter(mounted.input)
		answer()
		await flush()
		expect(mounted.created[0].start.toICALString()).toBe(utc(at(21, 14, 30)))
	})

	it('keeps the pills steady while typing, until the next answer arrives', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		const pills = () => wrapper.findAll('.pill__text').map(p => p.text())
		expect(pills()).toEqual(['Tomorrow'])
		await mounted.input.setValue('Dentist Friday at 3')
		expect(pills()).toEqual(['Tomorrow'])
		await vi.advanceTimersByTimeAsync(150)
		expect(pills()).toEqual(['Tomorrow'])
		answer(1)
		await flush()
		expect(pills()).toEqual(['Fri, Oct 23, 3:00 PM'])
	})

	it('clears the pills when the newest request fails', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		await mounted.input.setValue('Call the bank tomorrow x')
		await vi.advanceTimersByTimeAsync(150)
		expect(wrapper.find('.pill').exists()).toBe(true)
		posts[1].reject()
		await flush()
		expect(wrapper.find('.pill').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('Saved as')
	})

	it('clears the pills when the newest request hangs for a second', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		await mounted.input.setValue('Call the bank tomorrow x')
		await vi.advanceTimersByTimeAsync(150 + 999)
		expect(wrapper.find('.pill').exists()).toBe(true)
		await vi.advanceTimersByTimeAsync(1)
		expect(wrapper.find('.pill').exists()).toBe(false)
	})

	it('saves from the answer for the final text, not the older one on show', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		await mounted.input.setValue('Dentist Friday at 3')
		expect(wrapper.findAll('.pill__text').map(p => p.text())).toEqual(['Tomorrow'])
		await enter(mounted.input)
		answer(1)
		await flush()
		expect(mounted.created).toHaveLength(1)
		expect(mounted.created[0].summary).toBe('Dentist')
		expect(mounted.created[0].due.toICALString()).toBe(utc(at(23, 15)))
	})

	it('opens both of two quick entries in Week, whose route gains its day only when a task opens', async () => {
		const mounted = mountHeader({ params: { collectionId: 'week' } })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await enter(mounted.input)
		await mounted.input.setValue('Dentist Friday at 3')
		await enter(mounted.input)
		answer(0)
		answer(1)
		await flush()
		expect(mounted.$router.push).toHaveBeenCalledTimes(2)
		expect(mounted.$router.push.mock.calls[1][0].params.taskId).toBe('task-2.ics')
	})

	it('puts the text back and reports it when building the task fails', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		taskDataFromEntry.mockImplementationOnce(() => { throw new Error('bad answer') })
		await mounted.input.setValue('Call the bank tomorrow')
		await enter(mounted.input)
		answer()
		await flush()
		expect(mounted.created).toHaveLength(0)
		expect(mounted.input.element.value).toBe('Call the bank tomorrow')
		expect(showError).toHaveBeenCalledTimes(1)
	})

	it('saves the text as typed within a second when the parser does not answer', async () => {
		const mounted = mountHeader({ params: { collectionId: 'today' } })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await enter(mounted.input)
		await vi.advanceTimersByTimeAsync(999)
		expect(mounted.created).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(1)
		expect(mounted.created).toEqual([{ summary: 'Call the bank tomorrow', due: '2026-10-21T00:00:00', allDay: true, calendar: list }])
	})

	it('puts the text back and reports a failed save, without opening anything', async () => {
		const mounted = mountHeader({ createTask: () => Promise.reject(new Error('415')) })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await enter(mounted.input)
		answer()
		await flush()
		expect(mounted.input.element.value).toBe('Call the bank tomorrow')
		expect(showError).toHaveBeenCalledTimes(1)
		expect(mounted.$router.push).not.toHaveBeenCalled()
	})

	it('leaves the next entry alone when a failed save comes back', async () => {
		const mounted = mountHeader({ createTask: () => Promise.reject(new Error('415')) })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await enter(mounted.input)
		await mounted.input.setValue('Renew')
		answer(0)
		await flush()
		expect(mounted.input.element.value).toBe('Renew')
		expect(showError).toHaveBeenCalledTimes(1)
	})

	it('saves to the list and with the defaults of the view at Enter, even if the route changes', async () => {
		const mounted = mountHeader({ params: { collectionId: 'today' } })
		wrapper = mounted.wrapper
		await mounted.input.setValue('Renew passport')
		await enter(mounted.input)
		mounted.$route.params = { calendarId: 'other' }
		await flush()
		answer()
		await flush()
		expect(mounted.created).toEqual([{ summary: 'Renew passport', due: '2026-10-21T00:00:00', allDay: true, calendar: list }])
		expect(mounted.$router.push).not.toHaveBeenCalled()
	})

	it('drops a dismissed guess and asks again with it ignored', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(150)
		answer()
		await flush()
		await wrapper.find('.pill__clear').trigger('click')
		expect(wrapper.find('.pill').exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(150)
		expect(posts[1].body).toMatchObject({ text: 'Call the bank tomorrow', ignore: ['date'] })
	})

	it('sends focus back from a picker without selecting the box\'s text', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank tomorrow')
		const input = mounted.input.element
		input.focus()
		input.setSelectionRange(22, 22)
		input.blur()
		const returnFocus = wrapper.findComponent(NewTaskPills).props('returnFocus')
		// false tells the focus trap not to focus (and select) the box itself
		expect(returnFocus()).toBe(false)
		expect(document.activeElement).toBe(input)
		expect([input.selectionStart, input.selectionEnd]).toEqual([22, 22])
	})

	it('stops asking when a paste opens the multiple-tasks dialog', async () => {
		const mounted = mountHeader()
		wrapper = mounted.wrapper
		await mounted.input.setValue('Call the bank')
		await vi.advanceTimersByTimeAsync(150)
		expect(posts).toHaveLength(1)
		await mounted.input.trigger('paste', { clipboardData: { getData: () => 'Call the bank\nRenew passport' } })
		expect(posts[0].signal.aborted).toBe(true)
		await mounted.input.setValue('Call the bank tomorrow')
		await vi.advanceTimersByTimeAsync(500)
		expect(posts).toHaveLength(1)
	})
})
