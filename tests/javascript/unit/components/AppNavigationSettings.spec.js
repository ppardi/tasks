/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import AppNavigationSettings from '../../../../src/components/AppNavigation/AppNavigationSettings.vue'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'

/**
 * @param {object} settings The user's settings as the server sends them
 * @return {object} The wrapper and the recorded setSetting calls
 */
function mountSettings(settings) {
	const saved = []
	const store = createStore({
		state: () => ({ settings: { settings }, collections: { collections: [] } }),
		getters: { getDefaultCalendar: () => null, getSortedWritableCalendars: () => [] },
		actions: { setSetting: (context, payload) => saved.push(payload), setVisibility: () => {} },
	})
	const wrapper = mount(AppNavigationSettings, {
		global: {
			plugins: [store],
			stubs: {
				NcAppNavigationSettings: { template: '<div><slot /></div>' },
				NcCheckboxRadioSwitch: {
					props: ['modelValue'],
					emits: ['update:modelValue'],
					template: '<label><input type="checkbox" class="switch" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"><slot /></label>',
				},
			},
		},
	})
	return { wrapper, saved }
}

describe('AppNavigationSettings.vue - rollover', () => {
	it('shows rollover on by default', () => {
		const { wrapper } = mountSettings({})
		expect(wrapper.find('.rollover .switch').element.checked).toBe(true)
		expect(wrapper.find('.rollover').text()).toContain('Roll over unfinished tasks')
	})

	it('shows it off when the user turned it off', () => {
		const { wrapper } = mountSettings({ rollover: false })
		expect(wrapper.find('.rollover .switch').element.checked).toBe(false)
	})

	it('saves turning it off as 0', async () => {
		const { wrapper, saved } = mountSettings({ rollover: true })
		await wrapper.find('.rollover .switch').setValue(false)
		expect(saved).toEqual([{ type: 'rollover', value: 0 }])
	})
})
