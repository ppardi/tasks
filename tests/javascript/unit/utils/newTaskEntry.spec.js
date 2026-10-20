/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { formatLocalDateTime, parseLocalDateTime, taskDataFromEntry } from '../../../../src/utils/newTaskEntry.js'

import { describe, expect, it } from 'vitest'

// The endpoint's answers, as it sends them (zone-less local times). Now is
// Wednesday, 21 October 2026, 2:30 PM.
const milk = { title: 'Purchase milk at the grocery store', due: '2026-10-22T18:00:00', allDay: false, location: 'grocery store', found: true }
const allDay = { title: 'Call the bank', due: '2026-10-22T00:00:00', allDay: true, location: null, found: true }
const dentist = { title: 'Dentist', due: '2026-10-21T15:00:00', allDay: false, location: null, found: true }
const friday = { title: 'Call the bank', due: '2026-10-23T00:00:00', allDay: true, location: null, found: true }
const nothing = { title: 'Renew passport', due: null, allDay: false, location: null, found: false }

// What HeaderBar's getAdditionalTaskProperties gives in each view
const today = { due: '2026-10-21T00:00:00', allDay: true }
const current = { start: '2026-10-21T14:30:00' }
const starred = { priority: 1 }

describe('taskDataFromEntry', () => {
	it('takes the title, due date and place from the answer', () => {
		const text = 'Purchase milk at the grocery store tomorrow evening'
		expect(taskDataFromEntry({ text, answer: milk })).toEqual({
			summary: 'Purchase milk at the grocery store',
			due: '2026-10-22T18:00:00',
			allDay: false,
			location: 'grocery store',
		})
	})

	it('saves an all-day date at midnight, marked all day', () => {
		const data = taskDataFromEntry({ text: 'Call the bank tomorrow', answer: allDay })
		expect(data.due).toBe('2026-10-22T00:00:00')
		expect(data.allDay).toBe(true)
	})

	it('keeps a parsed time in Today, even with all-day due dates on', () => {
		const data = taskDataFromEntry({ text: 'Dentist at 3', answer: dentist, viewDefaults: today })
		expect(data.due).toBe('2026-10-21T15:00:00')
		expect(data.allDay).toBe(false)
	})

	it('lets a parsed Friday win over Today\'s default', () => {
		const data = taskDataFromEntry({ text: 'Call the bank Friday', answer: friday, viewDefaults: today })
		expect(data.due).toBe('2026-10-23T00:00:00')
		expect(data.allDay).toBe(true)
	})

	it('falls back to Today\'s default when nothing was parsed', () => {
		const data = taskDataFromEntry({ text: 'Renew passport', answer: nothing, viewDefaults: today })
		expect(data).toEqual({ summary: 'Renew passport', due: '2026-10-21T00:00:00', allDay: true })
	})

	it('drops Current\'s start "now" when the due date is before it', () => {
		const earlier = { ...dentist, due: '2026-10-21T08:00:00' }
		expect(taskDataFromEntry({ text: 'Dentist at 8am', answer: earlier, viewDefaults: current }).start).toBeUndefined()
		expect(taskDataFromEntry({ text: 'Call the bank today', answer: { ...allDay, due: '2026-10-21T00:00:00' }, viewDefaults: current }).start).toBeUndefined()
		expect(taskDataFromEntry({ text: 'Dentist at 3', answer: dentist, viewDefaults: current }).start).toBe('2026-10-21T14:30:00')
		expect(taskDataFromEntry({ text: 'Renew passport', answer: nothing, viewDefaults: current }).start).toBe('2026-10-21T14:30:00')
	})

	it('always gives a Starred task priority 1', () => {
		expect(taskDataFromEntry({ text: 'Dentist at 3', answer: dentist, viewDefaults: starred }).priority).toBe(1)
		expect(taskDataFromEntry({ text: 'Renew passport', answer: null, viewDefaults: starred }).priority).toBe(1)
	})

	it('saves the text as typed, with the view\'s defaults, when no answer came', () => {
		expect(taskDataFromEntry({ text: 'Dentist at 3', answer: null, viewDefaults: today }))
			.toEqual({ summary: 'Dentist at 3', due: '2026-10-21T00:00:00', allDay: true })
	})

	it('lets a changed place win over the answer', () => {
		const data = taskDataFromEntry({ text: 'Purchase milk at the grocery store tomorrow evening', answer: milk, overrides: { place: 'grocery' } })
		expect(data.location).toBe('grocery')
	})

	it('takes a changed date and its all-day flag as one', () => {
		const overrides = { date: { due: '2026-10-24T09:30:00', allDay: true } }
		const data = taskDataFromEntry({ text: 'Purchase milk at the grocery store tomorrow evening', answer: milk, overrides, viewDefaults: today })
		expect(data.due).toBe('2026-10-24T00:00:00')
		expect(data.allDay).toBe(true)
	})
})

describe('local date-time strings', () => {
	it('reads and writes the endpoint\'s zone-less form in local time', () => {
		expect(parseLocalDateTime('2026-10-22T18:00:00')).toEqual(new Date(2026, 9, 22, 18))
		expect(formatLocalDateTime(new Date(2026, 9, 22, 18, 5), false)).toBe('2026-10-22T18:05:00')
		expect(formatLocalDateTime(new Date(2026, 9, 22, 18, 5), true)).toBe('2026-10-22T00:00:00')
	})
})
