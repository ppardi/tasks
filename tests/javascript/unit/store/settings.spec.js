/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import settingsStore from '../../../../src/store/settings.js'

import { describe, expect, it, vi } from 'vitest'

const serverState = {}
vi.mock('@nextcloud/initial-state', () => ({
	loadState: (app, key, fallback) => (key in serverState ? serverState[key] : fallback),
}))

const load = () => {
	let settings
	settingsStore.actions.loadSettings({ commit: (name, value) => { settings = value } })
	return settings
}

describe('store/settings - rollover', () => {
	it('loads rollover as the server stored it, so a reload shows it off', () => {
		serverState.rollover = false
		expect(load().rollover).toBe(false)
	})

	it('loads it as on when the server says nothing', () => {
		delete serverState.rollover
		expect(load().rollover).toBe(true)
	})
})
