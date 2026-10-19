/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import MoreSection from '../../../../src/components/AppSidebar/MoreSection.vue'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

const mountMore = () => mount(MoreSection, { slots: { default: '<div class="row">Starts</div>' }, attachTo: document.body })

describe('MoreSection.vue', () => {
	it('is folded away by default, naming what it holds', () => {
		const wrapper = mountMore()
		expect(wrapper.find('.more__toggle').text()).toBe('More: start date, priority, status, location…')
		expect(wrapper.find('.more__toggle').attributes('aria-expanded')).toBe('false')
		expect(wrapper.find('.row').isVisible()).toBe(false)
	})

	it('opens to show its fields, and then offers Less', async () => {
		const wrapper = mountMore()
		await wrapper.find('.more__toggle').trigger('click')
		expect(wrapper.find('.row').isVisible()).toBe(true)
		expect(wrapper.find('.more__toggle').text()).toBe('Less')
		expect(wrapper.find('.more__toggle').attributes('aria-expanded')).toBe('true')
	})
})
