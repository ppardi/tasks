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
	<div class="header">
		<div class="header__top">
			<h2 v-if="title" class="header__title" :style="titleStyle">
				{{ title }}
			</h2>
			<FilterDropdown />
			<SortorderDropdown />
		</div>
		<div v-if="$route.params.collectionId !== 'completed' && calendar && !calendar.readOnly"
			class="header__input">
			<NcTextField ref="input"
				v-model="newTaskName"
				:placeholder="fieldPlaceholder"
				:aria-label="placeholder"
				:label-outside="true"
				autocomplete="off"
				class="reactive"
				trailing-button-icon="arrowEnd"
				:show-trailing-button="newTaskName !== ''"
				:trailing-button-label="placeholder"
				@trailing-button-click="addTask"
				@compositionstart="compositionstart()"
				@compositionend="compositionend()"
				@keydown.esc="clearNewTask($event)"
				@keydown.enter="addTask"
				@paste.stop="addMultipleTasks">
				<template #icon>
					<Plus :size="20" />
				</template>
			</NcTextField>
		</div>
		<FilterBar />
		<CreateMultipleTasksDialog v-if="showCreateMultipleTasksModal"
			:calendar="calendar"
			:tasks-to-create="multipleTasks"
			:tasks-additional-properties="additionalTaskProperties"
			@cancel="createMultipleTasksCancelled"
			@close="createMultipleTasksSuccessful" />
	</div>
</template>

<script>
import FilterBar from './FilterBar.vue'
import FilterDropdown from './FilterDropdown.vue'
import SortorderDropdown from './SortorderDropdown.vue'
import openNewTask from '../mixins/openNewTask.js'

import { translate as t } from '@nextcloud/l10n'
import moment from '@nextcloud/moment'
import NcTextField from '@nextcloud/vue/components/NcTextField'

import Plus from 'vue-material-design-icons/Plus.vue'

import { mapGetters, mapActions, mapState } from 'vuex'

import { textToTask } from '../utils/textToTask.js'
import CreateMultipleTasksDialog from './CreateMultipleTasksDialog.vue'

export default {
	components: {
		CreateMultipleTasksDialog,
		NcTextField,
		FilterBar,
		FilterDropdown,
		SortorderDropdown,
		Plus,
	},
	mixins: [openNewTask],
	data() {
		return {
			newTaskName: '',
			showCreateMultipleTasksModal: false,
			multipleTasks: { numberOfTasks: 0, tasks: {} },
			additionalTaskProperties: {},
			compositing: false,
		}
	},
	computed: {
		calendar() {
			return this.getCalendarByRoute(this.$route)
		},
		...mapGetters({
			getCalendarByRoute: 'getCalendarByRoute',
		}),
		...mapState({
			collections: state => state.collections.collections,
		}),

		/**
		 * The page title: the list's name in a list, the collection's name in a collection.
		 *
		 * @return {string}
		 */
		title() {
			if (this.$route.params.calendarId) {
				return this.calendar?.displayName ?? ''
			}
			const collection = this.collections.find(c => c.id === this.$route.params.collectionId)
			return collection?.displayName ?? ''
		},

		/**
		 * A list's title takes the list's color, as in Apple Reminders.
		 *
		 * @return {object}
		 */
		titleStyle() {
			if (this.$route.params.calendarId && this.calendar?.color) {
				return { color: this.calendar.color }
			}
			return {}
		},

		/**
		 * In a list the title already says where the task goes, so the field just
		 * says "New task". In a collection the full sentence names the target list.
		 *
		 * @return {string}
		 */
		fieldPlaceholder() {
			return this.$route.params.calendarId ? t('tasks', 'New task') : this.placeholder
		},

		placeholder() {
			switch (this.$route.params.collectionId) {
			case 'starred':
				return t('tasks', 'Add an important task to "{calendar}"…', { calendar: this.calendar.displayName }, undefined, { sanitize: false, escape: false })
			case 'week':
			case 'today':
				return t('tasks', 'Add a task due today to "{calendar}"…', { calendar: this.calendar.displayName }, undefined, { sanitize: false, escape: false })
			case 'current':
				return t('tasks', 'Add a current task to "{calendar}"…', { calendar: this.calendar.displayName }, undefined, { sanitize: false, escape: false })
			default:
				return t('tasks', 'Add a task to "{calendar}"…', { calendar: this.calendar.displayName }, undefined, { sanitize: false, escape: false })
			}
		},
	},
	methods: {
		...mapActions([
			'createTask',
		]),

		compositionstart() {
			this.compositing = true
		},
		compositionend() {
			this.compositing = false
		},

		clearNewTask(event) {
			if (this.compositing) {
				return
			}

			event.target.blur()
			this.newTaskName = ''
		},

		async addTask() {
			if (this.compositing) {
				return
			}

			const data = {
				summary: this.newTaskName,
				// If the task is created in the calendar view,
				// we set the current calendar
				...(this.$route.params.calendarId && { calendar: this.calendar }),
				...this.getAdditionalTaskProperties(),
			}
			const task = await this.createTask(data)
			await this.openNewTask(task)
			this.newTaskName = ''
			this.$refs.input.$refs.inputField.$refs.input.focus()
		},

		getAdditionalTaskProperties() {
			const taskProperties = {}
			// If the task is created in a collection view,
			// set the appropriate properties.
			if (this.$route.params.collectionId === 'starred') {
				taskProperties.priority = 1
			}
			if (this.$route.params.collectionId === 'today'
				|| this.$route.params.collectionId === 'week') {
				taskProperties.due = moment().startOf('day').format('YYYY-MM-DDTHH:mm:ss')
				taskProperties.allDay = this.$store.state.settings.settings.allDay
			}
			if (this.$route.params.collectionId === 'current') {
				taskProperties.start = moment().format('YYYY-MM-DDTHH:mm:ss')
			}
			return taskProperties
		},

		addMultipleTasks($event) {
			const pastedText = $event.clipboardData.getData('text')
			const tasksFromText = textToTask(pastedText)

			if (tasksFromText.numberOfTasks <= 1) {
				return
			}

			this.multipleTasks = tasksFromText
			this.showCreateMultipleTasksModal = true
			this.additionalTaskProperties = this.getAdditionalTaskProperties()
		},

		async createMultipleTasksCancelled() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			await this.$nextTick()
			this.$refs.input.$refs.inputField.$refs.input.focus()
		},

		async createMultipleTasksSuccessful() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			this.newTaskName = ''
			await this.$nextTick()
			this.$refs.input.$refs.inputField.$refs.input.focus()
		},
	},
}
</script>

<style lang="scss" scoped>
// mobile breakpoint
$breakpoint-mobile: 1024px;

.header {
	padding: calc(2 * var(--default-grid-baseline));
	padding-left: calc(4 * var(--default-grid-baseline) + var(--default-clickable-area)); // leave space for the app-nav-toggle
	position: sticky;
	background-color: var(--color-main-background);
	z-index: 1000;
	top: 0;

	@media only screen and (max-width: $breakpoint-mobile) {
		padding-right: 0;
		padding-left: calc(2 * var(--default-grid-baseline) + var(--default-clickable-area));
	}

	&__top {
		display: flex;
		align-items: center;
		min-height: var(--default-clickable-area);

		.filter {
			margin-left: auto;
		}
	}

	&__title {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-size: 26px;
		font-weight: bold;
		line-height: var(--default-clickable-area);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__input {
		position: relative;
		margin-top: calc(2 * var(--default-grid-baseline));
		margin-right: calc(2 * var(--default-grid-baseline));

		:deep(.input-field) {
			margin-block-start: 0 !important;

			.input-field__input {
				// A soft filled field instead of the bright outline. Nextcloud 35 draws
				// the outline with box-shadow, not border.
				border-color: transparent !important;
				box-shadow: none !important;
				background-color: var(--color-background-hover);
				border-radius: var(--border-radius-large);

				&:focus {
					box-shadow: 0 0 0 2px var(--color-primary-element) !important;
				}
			}
		}
	}
}
</style>
