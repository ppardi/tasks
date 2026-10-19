<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
One pill in the task panel: shows a value (or, unset, the field's name in
gray), opens its picker when clicked, and clears it from its ✕.
-->
<template>
	<span class="pill"
		:class="{ 'pill--set': set, 'pill--late': late, 'pill--disabled': disabled }">
		<button type="button"
			class="pill__main"
			:aria-label="ariaLabel || label"
			:aria-disabled="disabled ? 'true' : undefined"
			@click="disabled || $emit('open')">
			<component :is="icon" :size="16" class="pill__icon" />
			<span class="pill__text">{{ label }}</span>
		</button>
		<button v-if="clearable && !disabled"
			type="button"
			class="pill__clear"
			:aria-label="clearLabel"
			@click.stop="$emit('clear')">
			<Close :size="14" />
		</button>
	</span>
</template>

<script>
import Close from 'vue-material-design-icons/Close.vue'

export default {
	name: 'PillButton',
	components: {
		Close,
	},
	props: {
		icon: {
			type: [Object, Function],
			required: true,
		},
		label: {
			type: String,
			required: true,
		},
		ariaLabel: {
			type: String,
			default: null,
		},
		set: {
			type: Boolean,
			default: false,
		},
		late: {
			type: Boolean,
			default: false,
		},
		clearable: {
			type: Boolean,
			default: false,
		},
		clearLabel: {
			type: String,
			default: '',
		},
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['open', 'clear'],
}
</script>

<style lang="scss" scoped>
.pill {
	display: inline-flex;
	align-items: center;
	max-width: 100%;
	border-radius: var(--border-radius-pill, 16px);
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast);

	&--set {
		background-color: var(--color-primary-element-light);
		color: var(--color-primary-element-light-text);
	}

	&--late {
		color: var(--color-text-error);
	}

	button {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	&__main {
		gap: 6px;
		min-width: 0;
		padding-inline: 12px 12px !important;
		border-radius: inherit;

		&:hover,
		&:focus-visible {
			background-color: var(--color-background-darker);
		}
	}

	&--set &__main {
		padding-inline-end: 4px !important;
	}

	&--disabled &__main {
		cursor: default;

		&:hover {
			background: none;
		}
	}

	&__icon {
		opacity: .85;
	}

	&__text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: .93em;
	}

	&__clear {
		padding-inline: 4px 10px !important;
		border-radius: 0 var(--border-radius-pill, 16px) var(--border-radius-pill, 16px) 0;
		opacity: .75;

		&:hover,
		&:focus-visible {
			opacity: 1;
		}
	}
}
</style>
