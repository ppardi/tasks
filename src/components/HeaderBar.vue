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
			<NewTaskPills :due="shownDate && shownDate.due"
				:all-day="!!shownDate && shownDate.allDay"
				:place="shownPlace"
				:title="shownTitle"
				:return-focus="returnFocusToBox"
				@dismiss="dismissGuess"
				@edit="editGuess" />
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
import NewTaskPills from './NewTaskPills.vue'
import SortorderDropdown from './SortorderDropdown.vue'
import openNewTask from '../mixins/openNewTask.js'
import logger from '../utils/logger.js'
import { taskDataFromEntry } from '../utils/newTaskEntry.js'
import { createParseRequester } from '../utils/parseRequester.js'

import { showError } from '@nextcloud/dialogs'
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
		NewTaskPills,
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
			// Kinds dismissed for this entry ('date', 'place')
			ignore: [],
			// Pills changed for this entry: { date: { due, allDay }, place }
			overrides: {},
		}
	},
	computed: {
		parseOn() {
			return this.$store.state.settings.settings.parseNewTasks !== false
		},

		// The parser's newest answer for the box's text
		answer() {
			if (!this.parseOn || !this.newTaskName.trim()) {
				return null
			}
			return this.requester.current.value
		},

		shownDate() {
			if (this.overrides.date) {
				return this.overrides.date
			}
			if (!this.answer?.due || this.ignore.includes('date')) {
				return null
			}
			return { due: this.answer.due, allDay: !!this.answer.allDay }
		},

		shownPlace() {
			if (this.overrides.place) {
				return this.overrides.place
			}
			return this.ignore.includes('place') ? null : (this.answer?.location || null)
		},

		shownTitle() {
			return this.answer?.title || this.newTaskName.trim()
		},

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
	watch: {
		newTaskName(text) {
			// An emptied box forgets edits and dismissals
			if (!text.trim()) {
				this.ignore = []
				this.overrides = {}
			}
			this.requestParse()
		},
	},
	created() {
		// Not reactive: only its current answer is, and that is a ref
		this.requester = createParseRequester()
		// The saves, one after another, so tasks are created in the order entered
		this.saving = Promise.resolve()
	},
	beforeUnmount() {
		this.requester.cancel()
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
			this.requestParse()
		},

		/**
		 * Asks the parser about the box's text, after a pause. Typing never waits on it.
		 */
		requestParse() {
			if (!this.parseOn || this.compositing || this.showCreateMultipleTasksModal) {
				return
			}
			this.requester.update(this.newTaskName.trim(), this.ignore)
		},

		/**
		 * @param {string} kind 'date' or 'place': not a date or place after all
		 */
		dismissGuess(kind) {
			const overrides = { ...this.overrides }
			delete overrides[kind]
			this.overrides = overrides
			if (!this.ignore.includes(kind)) {
				this.ignore = [...this.ignore, kind]
			}
			this.requestParse()
			this.focusInput()
		},

		/**
		 * @param {object} edit { date: { due, allDay } } or { place }
		 */
		editGuess(edit) {
			this.overrides = { ...this.overrides, ...edit }
		},

		/**
		 * Where a pill's picker sends focus when it closes: back to the box, the
		 * caret where it was. Left to the focus trap, the box's whole text would
		 * be selected, and the next key typed would replace it.
		 *
		 * @return {boolean} false: the focus trap has nothing more to do
		 */
		returnFocusToBox() {
			this.focusInput()
			return false
		},

		focusInput() {
			this.$refs.input?.focus()
		},

		clearNewTask(event) {
			if (this.compositing) {
				return
			}

			event.target.blur()
			this.newTaskName = ''
		},

		/**
		 * Clears the box at once and saves the entry when the parser's answer for
		 * it is in, at most a second later. The next entry never waits.
		 *
		 * @param {Event} [event] The Enter keydown or the button's click
		 */
		addTask(event) {
			// Safari ends the composition before the Enter that confirms it
			if (this.compositing || event?.isComposing || event?.keyCode === 229) {
				return
			}
			const text = this.newTaskName.trim()
			if (!text) {
				return
			}

			// Everything as it is now: the route may change while the answer comes
			const ignore = [...this.ignore]
			const overrides = { ...this.overrides }
			const calendar = this.calendar
			const viewDefaults = this.getAdditionalTaskProperties()
			const list = this.listOf(this.$route)
			const answer = this.parseOn ? this.requester.settle(text, ignore) : Promise.resolve(null)

			this.newTaskName = ''
			this.ignore = []
			this.overrides = {}
			this.focusInput()

			this.saving = this.saving
				.then(() => answer)
				.then(answer => this.saveEntry({ text, ignore, overrides, list, data: { ...taskDataFromEntry({ text, answer, overrides, viewDefaults }), calendar } }))
				.catch(error => logger.error('Could not save the new task', { error }))
		},

		/**
		 * @param {object} entry The entry, as it was at Enter
		 * @param {string} entry.text The text typed, put back if the save fails
		 * @param {string[]} entry.ignore The kinds dismissed, put back with it
		 * @param {object} entry.overrides The changed pills, put back with it
		 * @param {object} entry.data The createTask payload
		 * @param {string} entry.list The list or collection shown at Enter
		 */
		async saveEntry({ text, ignore, overrides, data, list }) {
			let task
			try {
				task = await this.createTask(data)
				if (!task) {
					throw new Error('The list is read-only')
				}
			} catch (error) {
				logger.error('Could not create the task', { error })
				if (this.newTaskName === '') {
					this.ignore = ignore
					this.overrides = overrides
					this.newTaskName = text
				}
				showError(t('tasks', 'Could not add the task "{task}".', { task: text }, undefined, { sanitize: false, escape: false }))
				return
			}
			if (this.listOf(this.$route) === list) {
				await this.openNewTask(task)
			}
		},

		/**
		 * @param {object} route A route
		 * @return {string} The list or collection it shows
		 */
		listOf(route) {
			const { calendarId, collectionId, collectionParam } = route.params
			return JSON.stringify([calendarId, collectionId, collectionParam])
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

			this.requester.cancel()
			this.multipleTasks = tasksFromText
			this.showCreateMultipleTasksModal = true
			this.additionalTaskProperties = this.getAdditionalTaskProperties()
		},

		async createMultipleTasksCancelled() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			this.requestParse()
			await this.$nextTick()
			this.focusInput()
		},

		async createMultipleTasksSuccessful() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			this.newTaskName = ''
			await this.$nextTick()
			this.focusInput()
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
