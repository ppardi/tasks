<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="picker" role="menu">
		<div v-if="currentLabel && !currentKey" class="picker__current">
			{{ t('tasks', 'Current: {when}', { when: currentLabel }) }}
		</div>
		<button v-for="choice in choices"
			:key="choice.key"
			type="button"
			role="menuitemradio"
			:aria-checked="choice.key === currentKey ? 'true' : 'false'"
			class="picker__option"
			:class="{ 'picker__option--current': choice.key === currentKey }"
			@click="choose(choice.at)">
			<span>{{ choice.label }}</span>
			<Check v-if="choice.key === currentKey" :size="16" class="picker__hint" />
		</button>
		<div v-if="choices.length" class="picker__separator" />
		<form class="picker__custom" @submit.prevent="chooseCustom">
			<input v-model="customAt"
				type="datetime-local"
				:aria-label="t('tasks', 'Reminder date and time')">
		</form>
		<button type="button" class="picker__option" @click="chooseCustom">
			{{ t('tasks', 'Remind me then') }}
		</button>
		<div class="picker__separator" />
		<button type="button" class="picker__option" @click="$emit('custom')">
			{{ t('tasks', 'Custom…') }}
		</button>
		<button v-if="index !== null"
			type="button"
			class="picker__option picker__option--danger"
			@click="remove">
			{{ t('tasks', 'No reminder') }}
		</button>
	</div>
</template>

<script>
import { fixedTrigger, reminderChoices, reminderLabel } from '../../../utils/reminders.js'

import { translate as t, getCanonicalLocale } from '@nextcloud/l10n'
import ICAL from 'ical.js'
import { toRaw } from 'vue'

import Check from 'vue-material-design-icons/Check.vue'

const MINUTE = 60 * 1000

/**
 * @param {Date} date A date
 * @return {string} The value of a datetime-local input, local time
 */
const localInput = date => new Date(date.getTime() - date.getTimezoneOffset() * MINUTE).toISOString().slice(0, 16)

export default {
	name: 'ReminderPicker',
	components: {
		Check,
	},
	props: {
		task: {
			type: Object,
			required: true,
		},
		// The reminder being changed, or null to add one
		index: {
			type: Number,
			default: null,
		},
	},
	emits: ['done', 'custom'],
	data() {
		const tomorrowMorning = new Date()
		tomorrowMorning.setDate(tomorrowMorning.getDate() + 1)
		tomorrowMorning.setHours(9, 0, 0, 0)
		return {
			customAt: localInput(tomorrowMorning),
		}
	},
	computed: {
		choices() {
			const due = this.task.dueMoment.isValid() ? this.task.dueMoment.toDate() : null
			return reminderChoices(due, this.task.allDay)
		},

		current() {
			return this.index === null ? null : this.task.alarms[this.index] ?? null
		},

		currentAt() {
			const trigger = this.current?.getFirstPropertyValue('trigger')
			return trigger instanceof ICAL.Time ? toRaw(trigger).toJSDate() : null
		},

		currentKey() {
			if (!this.currentAt) {
				return null
			}
			const minute = date => Math.floor(date.getTime() / MINUTE)
			return this.choices.find(choice => minute(choice.at) === minute(this.currentAt))?.key ?? null
		},

		currentLabel() {
			return this.current ? reminderLabel(this.current, this.task, { locale: getCanonicalLocale() }) : ''
		},
	},
	methods: {
		t,

		/**
		 * @param {Date} at When to remind
		 */
		async choose(at) {
			const alarm = {
				action: 'DISPLAY',
				// When the action is "DISPLAY", the alarm MUST also include a "DESCRIPTION" property
				description: t('tasks', 'This is a todo reminder.'),
				trigger: fixedTrigger(at),
			}
			if (this.index === null) {
				await this.$store.dispatch('addAlarm', { task: this.task, alarm })
			} else if (this.currentAt) {
				await this.$store.dispatch('updateAlarm', { task: this.task, alarm, index: this.index })
			} else {
				// A reminder measured from a date cannot take a fixed time in place
				await this.$store.dispatch('removeAlarm', { task: this.task, indexes: [this.index] })
				await this.$store.dispatch('addAlarm', { task: this.task, alarm })
			}
			this.$emit('done')
		},

		chooseCustom() {
			if (this.customAt) {
				return this.choose(new Date(this.customAt))
			}
		},

		async remove() {
			await this.$store.dispatch('removeAlarm', { task: this.task, indexes: [this.index] })
			this.$emit('done')
		},
	},
}
</script>

<style lang="scss" scoped>
@use './picker.scss';
</style>
