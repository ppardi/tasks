<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="picker">
		<!-- First, so the popover's focus lands here and a new tag can be typed at once -->
		<div class="picker__custom">
			<input ref="newTag"
				v-model="newTag"
				type="text"
				:placeholder="t('tasks', 'New tag, then Enter')"
				:aria-label="t('tasks', 'New tag')"
				@keydown.enter.prevent="addNew">
		</div>
		<div v-if="allTags.length" class="picker__separator" />
		<label v-for="tag in allTags" :key="tag" class="picker__check">
			<input type="checkbox"
				:checked="task.tags.includes(tag)"
				@change="toggle(tag, $event.target.checked)">
			<span>{{ tag }}</span>
		</label>
	</div>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'TagsPicker',
	props: {
		task: {
			type: Object,
			required: true,
		},
	},
	emits: ['done'],
	data() {
		return {
			newTag: '',
		}
	},
	computed: {
		allTags() {
			const known = this.$store.getters.tags || []
			return [...new Set([...this.task.tags, ...known])].sort((a, b) => a.localeCompare(b))
		},
	},
	mounted() {
		this.$refs.newTag?.focus()
	},
	methods: {
		t,

		toggle(tag, checked) {
			const tags = checked ? [...this.task.tags, tag] : this.task.tags.filter(existing => existing !== tag)
			return this.$store.dispatch('setTags', { task: this.task, tags })
		},

		async addNew() {
			const tag = this.newTag.trim()
			if (!tag) {
				return
			}
			if (!this.task.tags.includes(tag)) {
				await this.$store.dispatch('setTags', { task: this.task, tags: [...this.task.tags, tag] })
			}
			this.newTag = ''
			this.$emit('done')
		},
	},
}
</script>

<style lang="scss" scoped>
@use './picker.scss';
</style>
