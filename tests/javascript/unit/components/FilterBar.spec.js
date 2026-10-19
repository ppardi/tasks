/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import FilterBar from '../../../../src/components/FilterBar.vue'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'

/**
 * @param {object} options Options
 * @param {string[]} [options.tags] Tags in the filter
 * @param {string} [options.search] The search query
 * @param {number} [options.count] Open tasks the page still shows
 * @param {object} [options.params] Route params
 * @return {object} The mounted wrapper and its store
 */
function mountBar({ tags = [], search = '', count = 3, params = { calendarId: 'cal' } } = {}) {
	const store = createStore({
		state: () => ({ filter: { tags }, searchQuery: search }),
		getters: {
			filter: state => state.filter,
			searchQuery: state => state.searchQuery,
			getCalendarCount: () => () => count,
			getCollectionCount: () => () => count,
		},
		mutations: {
			setFilter(state, filter) { state.filter = filter },
			setSearchQuery(state, query) { state.searchQuery = query },
		},
	})
	const wrapper = mount(FilterBar, {
		global: { plugins: [store], mocks: { $route: { params } } },
	})
	return { wrapper, store }
}

describe('FilterBar.vue', () => {
	it('is not shown while nothing filters the list', () => {
		const { wrapper } = mountBar()
		expect(wrapper.find('.filter-bar').exists()).toBe(false)
	})

	it('names every tag and the search the list is filtered by', () => {
		const { wrapper } = mountBar({ tags: ['Bill', 'Talk'], search: 'wire' })
		const text = wrapper.find('.filter-bar').text()
		expect(text).toContain('Filtered by')
		expect(text).toContain('Bill')
		expect(text).toContain('Talk')
		expect(text).toContain('wire')
	})

	it('removes only the tag whose chip is closed', async () => {
		const { wrapper, store } = mountBar({ tags: ['Bill', 'Talk'] })
		const billChip = wrapper.findAll('.filter-bar__chip').find(chip => chip.text().includes('Bill'))
		await billChip.find('button').trigger('click')
		expect(store.state.filter.tags).toEqual(['Talk'])
	})

	it('clears tags and search with one click, and then hides', async () => {
		const { wrapper, store } = mountBar({ tags: ['Bill'], search: 'wire' })
		await wrapper.find('.filter-bar__clear').trigger('click')
		expect(store.state.filter.tags).toEqual([])
		expect(store.state.searchQuery).toBe('')
		expect(wrapper.find('.filter-bar').exists()).toBe(false)
	})

	it('says so when the filter leaves nothing to show, instead of a blank list', () => {
		expect(mountBar({ tags: ['Bill'], count: 0 }).wrapper.text()).toContain('No open tasks match the filter.')
		expect(mountBar({ tags: ['Bill'], count: 2 }).wrapper.text()).not.toContain('No open tasks match')
	})
})
