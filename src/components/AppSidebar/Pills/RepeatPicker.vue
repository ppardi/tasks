<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="picker" role="menu">
		<button v-for="preset in presets"
			:key="preset.key"
			type="button"
			role="menuitemradio"
			:aria-checked="preset.key === current ? 'true' : 'false'"
			class="picker__option"
			@click="choose(preset.key)">
			<span>{{ preset.label }}</span>
			<Check v-if="preset.key === current" :size="16" class="picker__hint" />
		</button>
		<div class="picker__separator" />
		<button type="button" class="picker__option" @click="$emit('custom')">
			<span>{{ t('tasks', 'Custom…') }}</span>
			<Check v-if="current === null" :size="16" class="picker__hint" />
		</button>
	</div>
</template>

<script>
import { repeatPreset, repeatPresets, repeatRuleFor } from '../../../utils/repeatPresets.js'

import { translate as t } from '@nextcloud/l10n'

import Check from 'vue-material-design-icons/Check.vue'

export default {
	name: 'RepeatPicker',
	components: {
		Check,
	},
	props: {
		task: {
			type: Object,
			required: true,
		},
	},
	emits: ['done', 'custom'],
	computed: {
		presets() {
			return repeatPresets()
		},

		current() {
			return repeatPreset(this.task)
		},
	},
	methods: {
		t,

		async choose(preset) {
			if (preset === 'never') {
				await this.$store.dispatch('removeRecurrenceRule', { task: this.task })
			} else {
				await this.$store.dispatch('setRecurrenceRule', { task: this.task, recurrenceRule: repeatRuleFor(preset) })
			}
			this.$emit('done')
		},
	},
}
</script>

<style lang="scss" scoped>
@use './picker.scss';
</style>
