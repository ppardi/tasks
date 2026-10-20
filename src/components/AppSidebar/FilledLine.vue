<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
The line under the task panel's pills for a task the server filled in from its
title when it arrived, with Undo (docs/NL-DATES-DESIGN.md, "Undo"). Not shown
for a repeating task.
-->
<template>
	<p v-if="shown" class="filled-line">
		<span>{{ t('tasks', 'Filled in from the title') }}</span><template v-if="!readOnly">
			<span aria-hidden="true"> · </span><button type="button"
				class="filled-line__undo"
				:aria-label="t('tasks', 'Undo what was filled in from the title')"
				@click="undo">
				{{ t('tasks', 'Undo') }}
			</button>
		</template>
	</p>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'FilledLine',
	props: {
		task: {
			type: Object,
			required: true,
		},
		readOnly: {
			type: Boolean,
			default: false,
		},
	},
	computed: {
		shown() {
			return this.task.originalSummary !== null && !this.task.isRecurring
		},
	},
	methods: {
		t,
		undo() {
			this.$store.dispatch('undoFill', { task: this.task })
		},
	},
}
</script>

<style lang="scss" scoped>
.filled-line {
	margin: -6px 0 12px;
	color: var(--color-text-maxcontrast);
	font-size: .93em;

	&__undo {
		display: inline;
		min-height: 0;
		margin: 0;
		padding: 0 2px;
		border: none;
		border-radius: var(--border-radius);
		background: none;
		color: var(--color-primary-element);
		font: inherit;
		cursor: pointer;

		// Nextcloud tints buttons on hover; this one underlines like a link
		&:hover,
		&:focus-visible {
			background: none !important;
			text-decoration: underline;
		}
	}
}
</style>
