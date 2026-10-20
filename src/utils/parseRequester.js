/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { shallowRef } from 'vue'

/**
 * Asks the server's parser what it reads in a sentence.
 *
 * @param {{text: string, tz: string, ignore: string[]}} body The request
 * @param {AbortSignal} signal Cancels the request
 * @return {Promise<{title: string, due: ?string, allDay: boolean, location: ?string, found: boolean}>} The answer
 */
export async function postParse(body, signal) {
	const response = await axios.post(generateUrl('/apps/tasks/api/v1/parse'), body, { signal })
	return response.data
}

/**
 * @param {string} text The sentence
 * @param {string[]} ignore The kinds the parser is to leave alone
 * @return {string} What identifies a request
 */
const keyOf = (text, ignore) => JSON.stringify([text, [...ignore].sort()])

/**
 * Asks the parser about the New task box's text while it is typed, and for the
 * final answer when Enter is pressed.
 *
 * `update` waits for a pause and keeps only the newest answer in `current`;
 * starting a newer request cancels the older one it started. `settle` is
 * for a save: it owns its request, which nothing `update` or `cancel` does
 * can cancel, and resolves null when there is no answer in time.
 *
 * @param {object} options The options
 * @param {Function} [options.request] Sends one request: (body, signal) => Promise<answer>
 * @param {number} [options.delay] The pause to wait for, in milliseconds
 * @return {{update: Function, settle: Function, current: import('vue').Ref, answerFor: Function, cancel: Function}}
 */
export function createParseRequester({ request = postParse, delay = 150 } = {}) {
	// The newest answer for the text being typed, and what it answers
	const current = shallowRef(null)
	let currentKey = null
	let timer = null
	// The request update started last, while it runs: { key, controller, promise }
	let inFlight = null
	// Counts updates, so an answer to an older one is dropped
	let generation = 0

	const send = (text, ignore, signal) => {
		const body = { text, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ignore: [...ignore] }
		let promise
		try {
			promise = Promise.resolve(request(body, signal))
		} catch (error) {
			promise = Promise.reject(error)
		}
		return promise
			.then(answer => {
				if (!answer || typeof answer.title !== 'string') {
					throw new Error('Unexpected answer from the parser')
				}
				return answer
			})
	}

	const stop = () => {
		clearTimeout(timer)
		timer = null
		generation++
		inFlight?.controller.abort()
		inFlight = null
	}

	const forget = () => {
		current.value = null
		currentKey = null
	}

	/**
	 * @param {string} text The box's text
	 * @param {string[]} ignore The kinds dismissed for this entry
	 */
	const update = (text, ignore = []) => {
		stop()
		if (!text) {
			forget()
			return
		}
		const key = keyOf(text, ignore)
		if (key === currentKey) {
			return
		}
		const mine = generation
		timer = setTimeout(() => {
			timer = null
			const controller = new AbortController()
			const entry = { key, controller, promise: send(text, ignore, controller.signal) }
			inFlight = entry
			entry.promise.then(answer => {
				if (mine === generation) {
					currentKey = key
					current.value = answer
				}
			}, () => {
				// No answer for the newest text: an older one must not stand in for it
				if (mine === generation) {
					forget()
				}
			}).finally(() => {
				if (inFlight === entry) {
					inFlight = null
				}
			})
		}, delay)
	}

	/**
	 * @param {string} text The text to save
	 * @param {string[]} ignore The kinds dismissed for this entry
	 * @param {number} timeout How long to wait, in milliseconds
	 * @return {Promise<object|null>} The answer, or null if none came in time
	 */
	const settle = (text, ignore = [], timeout = 1000) => {
		const key = keyOf(text, ignore)
		if (key === currentKey && current.value) {
			return Promise.resolve(current.value)
		}
		let controller, promise
		if (inFlight?.key === key) {
			// Adopt it: from now on update no longer cancels it
			({ controller, promise } = inFlight)
			inFlight = null
		} else {
			controller = new AbortController()
			promise = send(text, ignore, controller.signal)
		}
		return new Promise(resolve => {
			const timeoutId = setTimeout(() => {
				controller.abort()
				resolve(null)
			}, timeout)
			promise.then(answer => {
				clearTimeout(timeoutId)
				resolve(answer)
			}, () => {
				clearTimeout(timeoutId)
				resolve(null)
			})
		})
	}

	const cancel = () => {
		stop()
		forget()
	}

	/**
	 * The current answer, only if it answers this text and ignore list.
	 * Reactive: it reads current.
	 *
	 * @param {string} text The text
	 * @param {string[]} ignore The kinds dismissed
	 * @return {object|null} The answer, or null
	 */
	const answerFor = (text, ignore = []) => {
		const answer = current.value
		return answer && currentKey === keyOf(text, ignore) ? answer : null
	}

	return { update, settle, current, answerFor, cancel }
}
