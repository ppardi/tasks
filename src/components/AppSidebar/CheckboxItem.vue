<!--
Nextcloud - Tasks

@author Raimund Schlüßler
@copyright 2021 Raimund Schlüßler <raimund.schluessler@mailbox.org>

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU AFFERO GENERAL PUBLIC LICENSE
License as published by the Free Software Foundation; either
version 3 of the License, or any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU AFFERO GENERAL PUBLIC LICENSE for more details.

You should have received a copy of the GNU Affero General Public
License along with this library. If not, see <http://www.gnu.org/licenses/>.

-->

<template>
	<div class="property__item" :class="{'property__item--disabled': readOnly}">
		<!-- A row with a switch at its end, like the rest of the panel's grouped fields -->
		<label :for="id" class="switch-row">
			<span class="switch-row__icon">
				<slot name="icon" />
			</span>
			<span class="switch-row__label">{{ propertyString }}</span>
			<input :id="id"
				type="checkbox"
				role="switch"
				class="switch-row__switch"
				:name="id"
				:aria-checked="checked"
				:checked="checked"
				:disabled="readOnly"
				@click="$emit('setChecked', checked)">
		</label>
	</div>
</template>

<script>

export default {
	props: {
		id: {
			type: String,
			required: true,
		},
		checked: {
			type: Boolean,
			default: false,
		},
		readOnly: {
			type: Boolean,
			default: false,
		},
		propertyString: {
			type: String,
			default: '',
		},
	},
	emits: ['setChecked'],
}
</script>

<style lang="scss" scoped>
.property__item {
	width: 100%;
	color: var(--color-main-text);
	line-height: var(--default-clickable-area);

	&--disabled * {
		cursor: default !important;
	}
}

.switch-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 0 12px;
	cursor: pointer;

	&__icon {
		display: flex;
		color: var(--color-text-maxcontrast);
	}

	&__label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	// !important: Nextcloud styles every input with a min-height and padding
	&__switch {
		appearance: none;
		position: relative;
		flex: none;
		width: 34px !important;
		height: 20px !important;
		min-height: 20px !important;
		margin: 0 !important;
		padding: 0 !important;
		border: none !important;
		box-shadow: none !important;
		border-radius: 10px;
		background-color: var(--color-border-dark);
		cursor: pointer;
		transition: background-color .15s;

		&::after {
			content: '';
			position: absolute;
			top: 2px;
			left: 2px;
			width: 16px;
			height: 16px;
			border-radius: 50%;
			background-color: var(--color-main-background);
			transition: left .15s;
		}

		&:checked {
			background-color: var(--color-primary-element);

			&::after {
				left: 16px;
			}
		}

		&:focus-visible {
			outline: 2px solid var(--color-primary-element);
			outline-offset: 2px;
		}
	}
}
</style>
