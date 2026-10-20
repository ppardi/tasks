<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="picker" role="menu">
		<button v-for="choice in choices"
			:key="choice.key"
			type="button"
			role="menuitem"
			class="picker__option"
			@click="setDate(choice.date)">
			<span>{{ choice.label }}</span>
			<span class="picker__hint">{{ choice.hint }}</span>
		</button>
		<div class="picker__separator" />
		<label v-if="!task" class="picker__check">
			<input v-model="allDayChoice" type="checkbox">
			{{ t('tasks', 'All day') }}
		</label>
		<form class="picker__custom" @submit.prevent="setCustom">
			<input v-model="customDate"
				type="date"
				:aria-label="t('tasks', 'Due date')">
			<input v-if="!allDayDue"
				v-model="customTime"
				type="time"
				:aria-label="t('tasks', 'Due time')">
		</form>
		<button type="button" class="picker__option" @click="setCustom">
			{{ t('tasks', 'Set') }}
		</button>
		<template v-if="hasDue">
			<div class="picker__separator" />
			<button type="button" class="picker__option picker__option--danger" @click="clear">
				{{ t('tasks', 'No due date') }}
			</button>
		</template>
	</div>
</template>

<script>
import { translate as t, getCanonicalLocale } from '@nextcloud/l10n'
import moment from '@nextcloud/moment'

import { formatLocalDateTime, parseLocalDateTime } from '../../../utils/newTaskEntry.js'

const MORNING = { hours: 9, minutes: 0 }

/**
 * @param {Date} date A date
 * @return {string} YYYY-MM-DD, local
 */
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * Picks a due date for a task, or, without a task, for the New task box: then
 * it has an All day checkbox, and reports the pick instead of saving it.
 */
export default {
	name: 'DuePicker',
	props: {
		task: {
			type: Object,
			default: null,
		},
		// Without a task: the due date shown, a zone-less local time
		due: {
			type: String,
			default: null,
		},
		// Without a task: whether that date is all day
		allDay: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['done', 'dueChanged', 'pick', 'dismiss'],
	data() {
		const due = this.task
			? (this.task.dueMoment.isValid() ? this.task.dueMoment.toDate() : null)
			: (this.due ? parseLocalDateTime(this.due) : null)
		const timed = this.task ? !this.task.allDay : !this.allDay
		const time = due && timed ? { hours: due.getHours(), minutes: due.getMinutes() } : MORNING
		const date = due || new Date(Date.now() + 24 * 60 * 60 * 1000)
		return {
			customDate: isoDate(date),
			customTime: `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`,
			allDayChoice: this.allDay,
		}
	},
	computed: {
		hasDue() {
			return this.task ? this.task.dueMoment.isValid() : !!this.due
		},

		// A due date takes the type of the task's dates (DUE and DTSTART must match);
		// a task with no dates at all gets a timed one. Without a task, the checkbox says.
		allDayDue() {
			if (!this.task) {
				return this.allDayChoice
			}
			return (this.hasDue || this.task.startMoment.isValid()) && this.task.allDay
		},

		// The time the quick choices keep: the current due time, else 9:00 AM
		time() {
			if (!this.task) {
				const due = this.due && !this.allDay ? parseLocalDateTime(this.due) : null
				return due ? { hours: due.getHours(), minutes: due.getMinutes() } : MORNING
			}
			if (this.hasDue && !this.task.allDay) {
				const due = this.task.dueMoment.toDate()
				return { hours: due.getHours(), minutes: due.getMinutes() }
			}
			return MORNING
		},

		choices() {
			const today = new Date()
			const inDays = days => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
			// The coming Saturday and Monday, 1 to 7 days ahead
			const saturday = inDays((6 - today.getDay() + 7) % 7 || 7)
			const monday = inDays((8 - today.getDay()) % 7 || 7)
			const short = date => new Intl.DateTimeFormat(getCanonicalLocale(), { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
			return [
				{ key: 'today', label: t('tasks', 'Today'), hint: '', date: inDays(0) },
				{ key: 'tomorrow', label: t('tasks', 'Tomorrow'), hint: new Intl.DateTimeFormat(getCanonicalLocale(), { weekday: 'short' }).format(inDays(1)), date: inDays(1) },
				{ key: 'weekend', label: t('tasks', 'This weekend'), hint: short(saturday), date: saturday },
				{ key: 'nextweek', label: t('tasks', 'Next week'), hint: short(monday), date: monday },
			]
		},
	},
	methods: {
		t,

		/**
		 * @param {Date} day The day, its time ignored
		 */
		setDate(day) {
			const date = new Date(day.getFullYear(), day.getMonth(), day.getDate())
			if (!this.allDayDue) {
				date.setHours(this.time.hours, this.time.minutes)
			}
			return this.save(date)
		},

		setCustom() {
			if (!this.customDate) {
				return
			}
			const [year, month, day] = this.customDate.split('-').map(Number)
			const [hours, minutes] = (this.customTime || '09:00').split(':').map(Number)
			return this.save(this.allDayDue ? new Date(year, month - 1, day) : new Date(year, month - 1, day, hours, minutes))
		},

		clear() {
			if (!this.task) {
				this.$emit('dismiss')
				this.$emit('done')
				return
			}
			return this.save(null)
		},

		/**
		 * @param {Date|null} date The new due date
		 */
		async save(date) {
			if (!this.task) {
				this.$emit('pick', { due: formatLocalDateTime(date, this.allDayDue), allDay: this.allDayDue })
				this.$emit('done')
				return
			}
			const result = await this.$store.dispatch('setDue', {
				task: this.task,
				due: date ? moment(date) : null,
				allDay: this.allDayDue,
			})
			this.$emit('dueChanged', result)
			this.$emit('done')
		},
	},
}
</script>

<style lang="scss" scoped>
@use './picker.scss';
</style>
