<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
The task panel's rarely used fields, folded away until asked for
(docs/TASK-PANEL-DESIGN.md, "More").
-->
<template>
	<div class="more">
		<button type="button"
			class="more__toggle"
			:aria-expanded="open ? 'true' : 'false'"
			@click="open = !open">
			<span>{{ open ? t('tasks', 'Less') : t('tasks', 'More: start date, priority, status, location…') }}</span>
			<ChevronDown v-if="open" :size="18" />
			<ChevronRight v-else :size="18" />
		</button>
		<div v-show="open" class="more__content">
			<slot />
		</div>
	</div>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'

import ChevronDown from 'vue-material-design-icons/ChevronDown.vue'
import ChevronRight from 'vue-material-design-icons/ChevronRight.vue'

export default {
	name: 'MoreSection',
	components: {
		ChevronDown,
		ChevronRight,
	},
	data() {
		return {
			open: false,
		}
	},
	methods: {
		t,
	},
}
</script>

<style lang="scss" scoped>
.more {
	margin-bottom: 10px;
	border-radius: var(--border-radius-large);
	background-color: var(--color-background-hover);

	&__toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: var(--default-clickable-area);
		margin: 0;
		padding: 0 12px;
		border: none;
		border-radius: var(--border-radius-large);
		background: none;
		color: var(--color-text-maxcontrast);
		font: inherit;
		text-align: start;
		cursor: pointer;

		&:hover,
		&:focus-visible {
			color: var(--color-main-text);
		}
	}

	&__content {
		border-top: 1px solid var(--color-border);
	}
}
</style>
