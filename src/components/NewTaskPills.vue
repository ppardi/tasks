<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
What the New task box read in its text (docs/NL-DATES-DESIGN.md): a pill for
the date and one for the place, in the task panel's pill style, and a quiet
line naming the title that will be saved. A pill opens a picker to change it;
its × says "that isn't a date / a place".
-->
<template>
	<div v-if="due || place" class="new-task-pills">
		<div class="new-task-pills__row">
			<NcPopover v-if="due"
				:shown="open === 'date'"
				:triggers="[]"
				popup-role="dialog"
				:set-return-focus="returnFocus"
				@update:shown="shown => shown || close()"
				@after-hide="mounted = open">
				<template #trigger>
					<PillButton :icon="CalendarBlankOutline"
						:label="dueLabel"
						:aria-label="t('tasks', 'Due {date}', { date: dueLabel })"
						:set="true"
						:clearable="true"
						:clear-label="t('tasks', 'Not a date')"
						@open="toggle('date')"
						@clear="$emit('dismiss', 'date')" />
				</template>
				<DuePicker v-if="mounted === 'date'"
					:due="due"
					:all-day="allDay"
					@pick="date => $emit('edit', { date })"
					@dismiss="$emit('dismiss', 'date')"
					@done="close" />
			</NcPopover>

			<NcPopover v-if="place"
				:shown="open === 'place'"
				:triggers="[]"
				popup-role="dialog"
				:set-return-focus="returnFocus"
				@update:shown="shown => shown || close()"
				@after-hide="mounted = open">
				<template #trigger>
					<PillButton :icon="MapMarkerOutline"
						:label="place"
						:aria-label="t('tasks', 'Location: {place}', { place })"
						:set="true"
						:clearable="true"
						:clear-label="t('tasks', 'Not a place')"
						@open="toggle('place')"
						@clear="$emit('dismiss', 'place')" />
				</template>
				<form v-if="mounted === 'place'"
					class="new-task-pills__place"
					@submit.prevent="savePlace">
					<label :for="placeId">{{ t('tasks', 'Location') }}</label>
					<input :id="placeId"
						v-model="placeText"
						type="text"
						autocomplete="off">
					<div class="new-task-pills__buttons">
						<button type="button" @click="close">
							{{ t('tasks', 'Cancel') }}
						</button>
						<button type="button" class="new-task-pills__primary" @click="savePlace">
							{{ t('tasks', 'Done') }}
						</button>
					</div>
				</form>
			</NcPopover>
		</div>
		<p v-if="title" class="new-task-pills__hint">
			{{ hint.before }}<strong>{{ title }}</strong>{{ hint.after }}
		</p>
	</div>
</template>

<script>
import DuePicker from './AppSidebar/Pills/DuePicker.vue'
import PillButton from './AppSidebar/Pills/PillButton.vue'
import { parseLocalDateTime } from '../utils/newTaskEntry.js'
import { shortDateLabel } from '../utils/rowDate.js'

import { translate as t, getCanonicalLocale } from '@nextcloud/l10n'
import NcPopover from '@nextcloud/vue/components/NcPopover'

import CalendarBlankOutline from 'vue-material-design-icons/CalendarBlankOutline.vue'
import MapMarkerOutline from 'vue-material-design-icons/MapMarkerOutline.vue'

import { markRaw } from 'vue'

// Stands in for the title while the line is translated, so the title can be bold
const TITLE = '\u0001'

let instances = 0

export default {
	name: 'NewTaskPills',
	components: {
		DuePicker,
		NcPopover,
		PillButton,
	},
	props: {
		// The date to show, a zone-less local time
		due: {
			type: String,
			default: null,
		},
		allDay: {
			type: Boolean,
			default: false,
		},
		place: {
			type: String,
			default: null,
		},
		// The title the entry will be saved with
		title: {
			type: String,
			default: '',
		},
		// Where focus goes when a picker closes (the box)
		returnFocus: {
			type: [Function, Boolean],
			default: undefined,
		},
	},
	emits: ['dismiss', 'edit'],
	data() {
		return {
			// Which picker is open: 'date' or 'place'
			open: null,
			// Which picker's content is mounted. It stays until its popover has
			// finished hiding: removing it first leaves the popover's focus trap
			// with nothing to focus, which throws.
			mounted: null,
			placeText: '',
			placeId: `new-task-place-${++instances}`,
			CalendarBlankOutline: markRaw(CalendarBlankOutline),
			MapMarkerOutline: markRaw(MapMarkerOutline),
		}
	},
	computed: {
		dueLabel() {
			return shortDateLabel(parseLocalDateTime(this.due), !this.allDay, new Date(), getCanonicalLocale())
		},

		hint() {
			const line = t('tasks', 'Saved as “{title}” · Enter to add', { title: TITLE }, undefined, { escape: false, sanitize: false })
			const [before, after = ''] = line.split(TITLE)
			return { before, after }
		},
	},
	watch: {
		// A pill that goes away takes its open picker with it
		due(due) {
			if (!due && this.open === 'date') {
				this.close()
			}
		},
		place(place) {
			if (!place && this.open === 'place') {
				this.close()
			}
		},
	},
	methods: {
		t,

		toggle(which) {
			this.open = this.open === which ? null : which
			if (this.open) {
				this.mounted = this.open
				if (which === 'place') {
					this.placeText = this.place
				}
			}
		},

		close() {
			this.open = null
		},

		savePlace() {
			const place = this.placeText.trim()
			this.close()
			if (place) {
				this.$emit('edit', { place })
			} else {
				this.$emit('dismiss', 'place')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.new-task-pills {
	margin: 8px 0 0 2px;

	&__row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;

		:deep(.v-popper) {
			display: inline-flex;
			max-width: 100%;
		}
	}

	&__hint {
		margin: 6px 0 0 4px;
		color: var(--color-text-maxcontrast);
		font-size: 12px;

		strong {
			font-weight: 600;
		}
	}

	&__place {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 250px;
		padding: 12px;

		label {
			color: var(--color-text-maxcontrast);
			font-size: .9em;
		}

		input {
			width: 100%;
			margin: 0;
		}
	}

	&__buttons {
		display: flex;
		justify-content: flex-end;
		gap: 6px;

		button {
			margin: 0;
		}
	}

	&__primary {
		background-color: var(--color-primary-element) !important;
		color: var(--color-primary-element-text) !important;
	}
}
</style>
