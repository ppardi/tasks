/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createParseRequester } from '../../../../src/utils/parseRequester.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const answerFor = text => ({ title: text.toUpperCase(), due: null, allDay: false, location: null, found: false })

/**
 * A fake endpoint: every call waits until answered by hand, and rejects
 * when its signal aborts, as axios does.
 *
 * @return {object} The request function and its recorded calls
 */
function fakeEndpoint() {
	const calls = []
	const request = vi.fn((body, signal) => new Promise((resolve, reject) => {
		const call = { body, signal, aborted: false, answer: () => resolve(answerFor(body.text)), fail: () => reject(new Error('500')) }
		signal.addEventListener('abort', () => { call.aborted = true; reject(new Error('canceled')) })
		calls.push(call)
	}))
	return { request, calls }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('createParseRequester', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('sends one request, 150 ms after the last of three quick updates', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		requester.update('B', [])
		await vi.advanceTimersByTimeAsync(50)
		requester.update('Bu', [])
		await vi.advanceTimersByTimeAsync(50)
		requester.update('Buy', [])
		await vi.advanceTimersByTimeAsync(149)
		expect(request).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(request).toHaveBeenCalledTimes(1)
		expect(calls[0].body).toEqual({ text: 'Buy', tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ignore: [] })
	})

	it('never lets a late answer for older text reach current', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		requester.update('milk', [])
		await vi.advanceTimersByTimeAsync(150)
		requester.update('milk tomorrow', [])
		await vi.advanceTimersByTimeAsync(150)
		expect(calls).toHaveLength(2)
		calls[1].answer()
		await flush()
		expect(requester.current.value.title).toBe('MILK TOMORROW')
		calls[0].answer()
		await flush()
		expect(requester.current.value.title).toBe('MILK TOMORROW')
	})

	it('settles from a matching current answer without a request', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		requester.update('milk', ['place'])
		await vi.advanceTimersByTimeAsync(150)
		calls[0].answer()
		await flush()
		const answer = await requester.settle('milk', ['place'])
		expect(answer.title).toBe('MILK')
		expect(request).toHaveBeenCalledTimes(1)
	})

	it('keeps a settling request alive when the box is emptied', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		requester.update('A', [])
		await vi.advanceTimersByTimeAsync(150)
		const settled = requester.settle('A', [])
		requester.update('', [])
		await vi.advanceTimersByTimeAsync(150)
		expect(request).toHaveBeenCalledTimes(1)
		expect(calls[0].aborted).toBe(false)
		calls[0].answer()
		expect((await settled).title).toBe('A')
	})

	it('keeps a settling request alive while the next entry is typed', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		const settled = requester.settle('A', [])
		expect(calls).toHaveLength(1)
		requester.update('B', [])
		await vi.advanceTimersByTimeAsync(150)
		expect(calls).toHaveLength(2)
		requester.update('Bo', [])
		await vi.advanceTimersByTimeAsync(150)
		expect(calls[0].aborted).toBe(false)
		expect(calls[1].aborted).toBe(true)
		calls[0].answer()
		expect((await settled).title).toBe('A')
	})

	it('settles to null after 1000 ms when the endpoint hangs', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		let result = 'pending'
		requester.settle('A', []).then(answer => { result = answer })
		await vi.advanceTimersByTimeAsync(999)
		expect(result).toBe('pending')
		await vi.advanceTimersByTimeAsync(1)
		expect(result).toBeNull()
		expect(calls[0].aborted).toBe(true)
	})

	it('settles to null when the endpoint fails', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		const settled = requester.settle('A', [])
		calls[0].fail()
		expect(await settled).toBeNull()
	})

	it('forgets its answer when the box is emptied or cancelled', async () => {
		const { request, calls } = fakeEndpoint()
		const requester = createParseRequester({ request })
		requester.update('A', [])
		await vi.advanceTimersByTimeAsync(150)
		calls[0].answer()
		await flush()
		expect(requester.current.value).not.toBeNull()
		requester.update('', [])
		expect(requester.current.value).toBeNull()

		requester.update('B', [])
		await vi.advanceTimersByTimeAsync(150)
		requester.cancel()
		expect(calls[1].aborted).toBe(true)
		requester.update('C', [])
		requester.cancel()
		await vi.advanceTimersByTimeAsync(150)
		expect(request).toHaveBeenCalledTimes(2)
	})
})
