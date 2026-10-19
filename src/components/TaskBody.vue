<!--
Nextcloud - Tasks

@author Raimund Schlüßler
@copyright 2021 Raimund Schlüßler <raimund.schluessler@mailbox.org>
@copyright 2018 Vadim Nicolai <contact@vadimnicolai.com>

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
	<li v-if="showTask"
		ref="taskItem"
		:task-id="task.uri"
		:class="{
			'task-item--closed': task.closed,
			'task-item--deleted': task.deleteCountdown !== null,
			'task-item--input-visible': (filteredSubtasksShown.length || showSubtaskInput),
			'task-item--subtasks-visible': filteredSubtasksShown.length,
			'task-item--non-started': !overdue(task.startMoment) && task.start
		}"
		:data-priority="[task.priority]"
		class="task-item"
		@dragstart="dragStart($event)">
		<div :task-id="task.uri"
			:class="{'task-item__body--active': isTaskOpen()}"
			class="task-item__body reactive"
			type="task"
			@click="navigate($event)">
			<!-- Checkbox -->
			<TaskCheckbox :completed="task.completed"
				class="no-nav"
				:cancelled="task.status === 'CANCELLED'"
				:read-only="readOnly"
				@toggle-completed="toggleCompleted(task)" />
			<!-- Info: summary, progress & tags -->
			<div class="task-body__info"
				@dblclick="editSummary()">
				<div class="summary">
					<span v-linkify="{text: task.summary, linkify: true}" class="summary__text" />
					<span v-if="rowDate"
						:class="{ 'summary__date--overdue': rowDate.overdue }"
						:title="rowDate.title"
						class="summary__date"><span class="summary__pipe" aria-hidden="true">|</span>{{ rowDate.text }}</span>
				</div>
				<div v-if="task.tags.length > 0" class="tags-list">
					<span v-for="(tag, index) in task.tags"
						:key="index"
						class="tag no-nav"
						@click="addTagToFilter(tag)">
						<span :title="tag" class="tag-label">
							{{ tag }}
						</span>
					</span>
				</div>
			</div>
			<!-- Icons: sync-status, calendarname, date, note, subtask-show-completed, subtask-visibility, add-subtask, starred -->
			<div class="task-body__icons">
				<TaskStatusDisplay :status="task.syncStatus"
					class="reactive no-nav"
					@status-clicked="updateTask"
					@reset-status="resetStatus({ task })" />
				<div v-if="collectionId=='week'" class="calendar">
					<span :style="{'background-color': task.calendar.color}" class="calendar__indicator" />
					<span class="calendar__name">{{ task.calendar.displayName }}</span>
				</div>
				<SortVariant v-if="hasHiddenSubtasks" :size="20" :title="t('tasks', 'Task has hidden subtasks')" />
				<CalendarClock v-if="!overdue(task.startMoment) && task.start" :size="20" :title="startDateString(task)" />
				<Repeat v-if="task.isRecurring" :size="20" :title="t('tasks', 'Task is recurring')" />
				<Pin v-if="task.pinned" :size="20" :title="t('tasks', 'Task is pinned')" />
				<TextBoxOutline v-if="task.note!=''"
					:size="20"
					:title="t('tasks', 'Task has a note')"
					@click="openAppSidebarTab($event, 'app-sidebar-tab-notes')"
					@dblclick.stop="openAppSidebarTab($event, 'app-sidebar-tab-notes', true)" />
				<NcProgressBar v-if="task.complete > 0"
					type="circular"
					:value="task.complete"
					:aria-label="t('tasks', '{complete} % completed', {complete: task.complete})"
					:title="t('tasks', '{complete} % completed', {complete: task.complete})"
					:color="task.calendar.color" />
				<Bell v-if="task.alarms.length > 0" :size="20" :title="n('tasks', 'Task has one reminder', 'Task has {n} reminders', task.alarms.length, { n: task.alarms.length })" />
				<NcActions v-if="task.deleteCountdown === null" class="reactive no-nav task-item__menu" menu-align="right">
					<NcActionButton v-if="!task.calendar.readOnly"
						:close-after-click="true"
						class="reactive no-nav open-input"
						@click="openSubtaskInput">
						<template #icon>
							<Plus :size="20" />
						</template>
						{{ t('tasks', 'Add subtask') }}
					</NcActionButton>
					<NcActionButton v-if="Object.values(task.subTasks).length"
						class="reactive no-nav"
						@click="toggleSubtasksVisibility(task)">
						<template #icon>
							<SortVariant :size="20" />
						</template>
						{{ task.hideSubtasks ? t('tasks', 'Show subtasks') : t('tasks', 'Hide subtasks') }}
					</NcActionButton>
					<NcActionButton v-if="hasCompletedSubtasks"
						class="reactive no-nav"
						@click="toggleCompletedSubtasksVisibility(task)">
						<template #icon>
							<Eye :size="20" />
						</template>
						{{ task.hideCompletedSubtasks ? t('tasks', 'Show closed subtasks') : t('tasks', 'Hide closed subtasks') }}
					</NcActionButton>
					<NcActionButton v-if="!readOnly"
						:close-after-click="true"
						class="reactive no-nav"
						@click="duplicateTask({ task })">
						<template #icon>
							<ContentDuplicate :size="20" />
						</template>
						{{ t('tasks', 'Duplicate task') }}
					</NcActionButton>
					<NcActionButton v-if="!readOnly"
						class="reactive no-nav"
						@click="scheduleTaskDeletion(task)">
						<template #icon>
							<Delete :size="20" />
						</template>
						{{ t('tasks', 'Delete task') }}
					</NcActionButton>
				</NcActions>
				<NcActions v-if="task.deleteCountdown !== null">
					<NcActionButton class="reactive no-nav"
						@click.prevent.stop="clearTaskDeletion(task)">
						<template #icon>
							<Undo :size="20" />
						</template>
						{{ n('tasks', 'Deleting the task in {countdown} second', 'Deleting the task in {countdown} seconds', task.deleteCountdown, { countdown: task.deleteCountdown }) }}
					</NcActionButton>
				</NcActions>
				<NcActions :disabled="readOnly" :class="[{ priority: task.priority }, priorityClass]" class="reactive no-nav">
					<NcActionButton :disabled="readOnly"
						@click="toggleStarred(task)">
						<template #icon>
							<Star :size="20" />
						</template>
						{{ t('tasks', 'Toggle starred') }}
					</NcActionButton>
				</NcActions>
			</div>
		</div>
		<div class="task-item__subtasks">
			<div v-if="showSubtaskInput"
				v-click-outside="closeSubtaskInput"
				class="task-item task-item__input">
				<NcTextField ref="input"
					v-model="newTaskName"
					:placeholder="subtasksCreationPlaceholder"
					:label-outside="true"
					:disabled="isAddingTask"
					autocomplete="off"
					class="reactive"
					trailing-button-icon="arrowEnd"
					:show-trailing-button="newTaskName !== ''"
					:trailing-button-label="subtasksCreationPlaceholder"
					@trailing-button-click="addTask"
					@keyup.esc="showSubtaskInput = false"
					@keyup.enter="addTask"
					@paste.stop="addMultipleTasks">
					<template #icon>
						<Plus :size="20" />
					</template>
				</NcTextField>
			</div>
			<TaskDragContainer :tasks="filteredSubtasksShown"
				:disabled="task.calendar.readOnly"
				:collection-string="collectionString"
				:task-id="task.uri"
				:calendar-id="task.calendar.uri" />
		</div>
		<CreateMultipleTasksDialog v-if="showCreateMultipleTasksModal"
			:root-task="task"
			:calendar="task.calendar"
			:tasks-to-create="multipleTasks"
			:tasks-additional-properties="additionalTaskProperties"
			@cancel="createMultipleTasksCancelled"
			@close="createMultipleTasksSuccessful" />
	</li>
</template>

<script>
import { overdue, sort, searchSubTasks, isTaskInList } from '../store/storeHelper.js'
import TaskCheckbox from './TaskCheckbox.vue'
import TaskStatusDisplay from './TaskStatusDisplay.vue'
import TaskDragContainer from './TaskDragContainer.vue'
import Task from '../models/task.js'
import openNewTask from '../mixins/openNewTask.js'
import { startDateString } from '../utils/dateStrings.js'
import { rowDate } from '../utils/rowDate.js'

import { emit } from '@nextcloud/event-bus'
import { translate as t, translatePlural as n } from '@nextcloud/l10n'
import moment from '@nextcloud/moment'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import Linkify from '@nextcloud/vue/directives/Linkify'

import Bell from 'vue-material-design-icons/BellOutline.vue'
import ContentDuplicate from 'vue-material-design-icons/ContentDuplicate.vue'
import Delete from 'vue-material-design-icons/TrashCanOutline.vue'
import Eye from 'vue-material-design-icons/EyeOutline.vue'
import Pin from 'vue-material-design-icons/PinOutline.vue'
import Plus from 'vue-material-design-icons/Plus.vue'
import TextBoxOutline from 'vue-material-design-icons/TextBoxOutline.vue'
import SortVariant from 'vue-material-design-icons/SortVariant.vue'
import CalendarClock from 'vue-material-design-icons/CalendarClock.vue'
import Repeat from 'vue-material-design-icons/Repeat.vue'
import Star from 'vue-material-design-icons/StarOutline.vue'
import Undo from 'vue-material-design-icons/Undo.vue'

import { vOnClickOutside as ClickOutside } from '@vueuse/components'
import { mapGetters, mapActions, mapMutations } from 'vuex'

import { textToTask } from '../utils/textToTask.js'
import CreateMultipleTasksDialog from './CreateMultipleTasksDialog.vue'

export default {
	name: 'TaskBody',
	directives: {
		ClickOutside,
		Linkify,
	},
	components: {
		CreateMultipleTasksDialog,
		TaskCheckbox,
		TaskStatusDisplay,
		TaskDragContainer,
		NcActions,
		NcActionButton,
		NcProgressBar,
		NcTextField,
		Bell,
		ContentDuplicate,
		Delete,
		Eye,
		Pin,
		Plus,
		TextBoxOutline,
		SortVariant,
		CalendarClock,
		Repeat,
		Star,
		Undo,
	},
	mixins: [openNewTask],
	props: {
		task: {
			type: Object,
			required: true,
		},
		collectionString: {
			type: String,
			default: null,
		},
	},
	data() {
		return {
			showSubtaskInput: false,
			newTaskName: '',
			isAddingTask: false,
			showCreateMultipleTasksModal: false,
			multipleTasks: { numberOfTasks: 0, tasks: {} },
			additionalTaskProperties: {},
		}
	},
	computed: {
		...mapGetters({
			searchQuery: 'searchQuery',
			filter: 'filter',
		}),

		/**
		 * The short date shown after the task's name: due date, else reminder,
		 * else completion date for completed tasks.
		 *
		 * @return {{text: string, title: string, overdue: boolean}|null}
		 */
		rowDate() {
			return rowDate(this.task)
		},

		collectionId() {
			if (this.collectionString) {
				return this.collectionString.split('-')[0]
			} else {
				return null
			}
		},

		collectionParam() {
			try {
				return this.collectionString.split('-')[1]
			} catch {
				return undefined
			}
		},

		priorityClass() {
			if (+this.task.priority > 5) {
				return 'priority--low'
			}
			if (+this.task.priority === 5) {
				return 'priority--medium'
			}
			if (+this.task.priority > 0) {
				return 'priority--high'
			}
			return null
		},

		hasCompletedSubtasks() {
			return Object.values(this.task.subTasks).some(subTask => {
				return subTask.closed
			})
		},

		hasHiddenSubtasks() {
			return (this.hasCompletedSubtasks && this.task.hideCompletedSubtasks) || (this.filteredSubtasks.length && this.task.hideSubtasks)
		},

		/**
		 * Returns the placeholder string shown in the subtasks input field
		 *
		 * @return {string} the placeholder string to show
		 */
		subtasksCreationPlaceholder() {
			return t('tasks', 'Add a subtask to "{task}"…', { task: this.task.summary }, undefined, { sanitize: false, escape: false })
		},

		/**
		 * Returns the subtasks filtered by completed state if necessary and
		 * filtered by collections (for week, today, important and current) when
		 * the task is not opened in details view.
		 *
		 * @return {Array} the array with the filtered subtasks
		 */
		filteredSubtasks() {
			let subTasks = Object.values(this.task.subTasks)
			if (this.task.hideCompletedSubtasks) {
				subTasks = subTasks.filter(task => {
					return !task.listedAsClosed
				})
			}
			if (['today', 'week', 'starred', 'current'].indexOf(this.collectionId) > -1
				&& !this.isTaskOpen()) {
				subTasks = subTasks.filter(task => {
					return isTaskInList(task, this.collectionString) || this.isTaskOpen(task) || this.isDescendantOpen(task)
				})
			}
			return subTasks
		},

		/**
		 * Returns the filtered subtasks or an empty array if the subtasks should be hidden.
		 *
		 * @return {Array} the array with the subtasks to show
		 */
		filteredSubtasksShown() {
			 if (this.showSubtasks) {
				return this.filteredSubtasks
			 }
			 return []
		},

		/**
		 * Indicates whether we show the task because it matches the search.
		 *
		 * @return {boolean} If the task matches
		 */
		showTask() {
			// If the task directly matches the search, we show it.
			if (this.task.matches(this.searchQuery, this.filter)) {
				return true
			}
			// We also have to show tasks for which one sub(sub...)task matches.
			return this.searchSubTasks(this.task, this.searchQuery, this.filter)
		},

		/**
		 * Checks whether we show the subtasks
		 *
		 * @return {boolean} If we show the subtasks
		 */
		showSubtasks() {
			if (!this.task.hideSubtasks || this.searchQuery || this.isTaskOpen() || this.isDescendantOpen()) {
				return true
			} else {
				return false
			}
		},

		/**
		 * Whether we treat the task as read-only.
		 * We also treat tasks in shared calendars with an access class other than 'PUBLIC'
		 * as read-only.
		 *
		 * @return {boolean} Is the task read-only
		 */
		readOnly() {
			return this.task.calendar.readOnly || (this.task.calendar.isSharedWithMe && this.task.class !== 'PUBLIC')
		},
	},

	created() {
		if (!this.task.loadedCompleted && this.$route.params.taskId === this.task.uri) {
			this.getTasksFromCalendar({ calendar: this.task.calendar, completed: true, related: this.task.uid })
		}
	},

	methods: {
		t,
		n,
		startDateString,

		...mapActions([
			'toggleCompleted',
			'toggleStarred',
			'createTask',
			'duplicateTask',
			'getTasksFromCalendar',
			'toggleSubtasksVisibility',
			'toggleCompletedSubtasksVisibility',
			'scheduleTaskDeletion',
			'clearTaskDeletion',
			'fetchFullTask',
		]),
		...mapMutations(['resetStatus', 'setFilter']),
		sort,
		/**
		 * Checks if a date is overdue
		 */
		overdue,

		updateTask() {
			if (this.task.syncStatus?.status === 'conflict') {
				this.fetchFullTask({ task: this.task })
			}
		},

		addTagToFilter(tag) {
			const filter = this.filter
			if (!this.filter?.tags.includes(tag)) {
				filter.tags.push(tag)
				this.setFilter(filter)
			}
		},

		/**
		 * Set task uri in the data transfer object
		 * so we can get it when dropped on an
		 * app-navigation-item
		 *
		 * @param {object} e The drag event
		 */
		dragStart(e) {
			// Only set the uri if it's the closest task to the drag event
			// so we don't get the uri of the root task (the event bubbles up).
			if (e.target.closest('.task-item') !== this.$refs.taskItem) {
				return
			}
			e.dataTransfer.setData('text/uri', this.task.uri)
		},

		/**
		 * Checks if one of the tasks sub(sub-...)tasks matches the search query
		 *
		 * @param {Task} task The task to search in
		 * @param {string} searchQuery The string to find
		 * @return {boolean} If the task matches
		 */
		searchSubTasks,

		/**
		 * Checks whether the task is currently open in the details view
		 *
		 * @param {Task} task The task to check
		 * @return {boolean} If it is open
		 */
		isTaskOpen(task = this.task) {
			return (task.uri === this.$route.params.taskId) && (this.collectionParam === this.$route.params.collectionParam)
		},

		/**
		 * Checks whether one of the tasks descendants is currently open in the details view
		 *
		 * @param {Task} task The task to check
		 * @return {boolean} If a descendeant is open
		 */
		isDescendantOpen(task = this.task) {
			if (this.collectionParam !== this.$route.params.collectionParam) {
				return false
			}
			const taskId = this.$route.params.taskId
			const checkSubtasksOpen = function subtasksOpen(tasks) {
				for (const key in tasks) {
					const task = tasks[key]
					if (task.uri === taskId) {
						return true
					}
					if (subtasksOpen(task.subTasks)) {
						return true
					}
				}
				return false
			}
			return checkSubtasksOpen(task.subTasks)
		},

		/**
		 * Navigates to a different route, but checks if navigation is desired
		 *
		 * @param {object} $event the event that triggered navigation
		 */
		async navigate($event) {
			if (!$event.target.closest('.no-nav')
				&& (this.$route.params.taskId !== this.task.uri || this.$route.params.collectionParam !== this.collectionParam)) {
				if (!this.task.loadedCompleted) {
					this.getTasksFromCalendar({ calendar: this.task.calendar, completed: true, related: this.task.uid })
				}
				if (this.$route.params.calendarId) {
					await this.$router.push({
						name: 'calendarsTask',
						params: {
							calendarId: this.$route.params.calendarId,
							taskId: this.task.uri,
						},
					})
				} else if (this.collectionId) {
					if (this.collectionParam) {
						await this.$router.push({
							name: 'collectionsParamTask',
							params: {
								collectionId: this.collectionId,
								collectionParam: this.collectionParam,
								taskId: this.task.uri,
							},
						})
					} else {
						await this.$router.push({
							name: 'collectionsTask',
							params: {
								collectionId: this.collectionId,
								taskId: this.task.uri,
							},
						})
					}
				}
			}
		},

		async openAppSidebarTab($event, tab, edit = false) {
			// Open the AppSidebar and wait for it to be mounted
			await this.navigate($event)
			// Emit event to show the tab
			emit('tasks:open-appsidebar-tab', tab)
			if (edit) {
				emit('tasks:edit-appsidebar-notes', $event)
			}
		},

		editSummary() {
			// emit an event to edit the task summary
			emit('tasks:edit-appsidebar-summary', true)
		},

		async openSubtaskInput() {
			this.showSubtaskInput = true
			await this.$nextTick()
			this.$refs.input.$refs.inputField.$refs.input.focus()
		},

		closeSubtaskInput() {
			this.showSubtaskInput = false
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

		createMultipleTasksCancelled() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			this.openSubtaskInput()
		},

		createMultipleTasksSuccessful() {
			this.showCreateMultipleTasksModal = false
			this.multipleTasks = { numberOfTasks: 0, tasks: {} }
			this.additionalTaskProperties = {}
			this.newTaskName = ''
			this.openSubtaskInput()
		},

		async addTask($event) {
			$event?.stopPropagation()

			const task = await this.createTask({
				summary: this.newTaskName,
				calendar: this.task.calendar,
				related: this.task.uid,
				...this.getAdditionalTaskProperties(),
			})
			await this.openNewTask(task)
			this.newTaskName = ''
			// Focus the input field again, in case we clicked on the trailing-icon-button
			this.$refs.input.$refs.inputField.$refs.input.focus()
		},

		getAdditionalTaskProperties() {
			const taskProperties = {}
			// If the task is created in a collection view,
			// set the appropriate properties.
			if (this.collectionId === 'starred') {
				taskProperties.priority = '1'
			}
			if (this.collectionId === 'today') {
				taskProperties.due = moment().startOf('day').format('YYYY-MM-DDTHH:mm:ss')
			}
			if (this.collectionId === 'current') {
				taskProperties.start = moment().format('YYYY-MM-DDTHH:mm:ss')
			}
			return taskProperties
		},
	},
}
</script>

<style lang="scss" scoped>
$red_overdue: #b3312d; // high importance
$yellow: #fd0; // medium importance
$blue_due: #4271a6; // low importance

// mobile breakpoint
$breakpoint-mobile: 1024px;

// The list reads as plain text on the page background: no row fills, no
// separators, no outline around the list. Only hover and the open task are tinted.
.task-item {
	position: relative;
	cursor: default;
	list-style: none outside none;

	&--closed .task-item__body .task-body__info {
		opacity: .6;
		.summary__text {
			text-decoration: line-through;
		}
	}

	&--deleted .task-body__info {
		opacity: .6;
	}

	&--non-started {
		.summary__text {
			color: var(--color-text-maxcontrast);
		}

		.task-checkbox {
			opacity: .2;
		}
	}

	&.sortable-ghost {
		filter: drop-shadow(0 0 3px var(--color-primary-element));
		z-index: 5;
	}

	&__input {
		overflow: hidden;

		:deep() .input-field {
			margin-block-start: 0 !important;

			&__main-wrapper,
			&__input {
				// prevent text jump on hover
				--input-border-width-offset: calc(var(--border-width-input-focused, 2px) - var(--border-width-input, 2px)) !important;
			}

			// Soft filled, like the new-task field. Nextcloud 35 draws the
			// outline with box-shadow, not border.
			&__input {
				border-color: transparent !important;
				box-shadow: none !important;
				background-color: var(--color-background-hover);
				border-radius: var(--border-radius-large);
			}

			&__input:focus {
				box-shadow: 0 0 0 2px var(--color-primary-element) !important;
			}

			&__icon--leading {
				inset-inline-start: 0 !important;
			}

			&__input--leading-icon {
				padding-left: 44px;
			}
		}
	}

	&__body {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		// Top-aligned so a name that wraps keeps its checkbox and icons on the first line
		align-items: flex-start;
		min-height: var(--default-clickable-area);
		position: relative;
		border-radius: var(--border-radius-large);

		&:hover {
			background-color: var(--color-background-hover);
		}

		&--active {
			background-color: var(--color-primary-element-light) !important;

			.tag {
				background-color: var(--color-main-background) !important;
			}
		}

		.task-body {
			&__info {
				display: flex;
				align-items: flex-start;
				flex-grow: 1;
				min-width: 0;
				cursor: pointer;
				color: var(--color-main-text);
				margin: 0;
				position: relative;

				.summary {
					cursor: text;
					// The name gets the room; tags shrink and truncate first
					flex: 1 1 auto;
					min-width: 0;
					// Centers a single line on the 44px row, and lets longer names wrap
					padding-block: calc((var(--default-clickable-area) - 20px) / 2);
					line-height: 20px;
					overflow-wrap: anywhere;

					&__text {
						// We need deep as it comes from a directive
						:deep(a) {
							cursor: pointer;
							text-decoration: underline;
							margin: 0;
						}
					}

					&__date {
						color: var(--color-text-maxcontrast);
						font-size: .93em;
						white-space: nowrap;

						&--overdue {
							color: var(--color-text-error);
						}
					}

					&__pipe {
						color: var(--color-text-maxcontrast);
						opacity: .5;
						margin-inline: 8px;
					}
				}

				.tags-list {
					display: flex;
					// Natural width up to 40% of the row; the name keeps the rest
					flex: 0 0 auto;
					align-items: center;
					max-width: 40%;
					margin-top: calc((var(--default-clickable-area) - 28px) / 2);
					overflow: hidden;

					.tag {
						height: 28px;
						overflow: hidden;
						display: flex;
						padding: 0 12px;
						background-color: var(--color-primary-element-light);
						border: none;
						border-radius: 18px !important;
						margin: 0 4px;
						align-items: center;
						cursor: pointer;

						.tag-label {
							text-overflow: ellipsis;
							overflow: hidden;
							white-space: nowrap;
							width: 100%;
							text-align: center;
							cursor: pointer;
						}
					}
				}

			}
			&__icons {
				align-items: center;
				display: flex;
				flex-shrink: 0;
				height: var(--default-clickable-area);
				margin-left: auto;
				color: var(--color-text-maxcontrast);

				& > div:not(.action-item) {
					height: 44px;
					padding: 14px 7px;
					display: flex;
					flex-direction: row;
					align-items: center;
					flex-wrap: nowrap;
				}

				& > .material-design-icon {
					opacity: .7;
					margin-inline: 4px;

					&.text-box-outline-icon {
						cursor: pointer;
					}
				}

				& > div.task-status-container {
					padding: 14px 0;

					.status-display {
						margin-left: 7px;
					}
				}

				// The star and the "⋯" menu: quiet gray until hovered
				.action-item--single:not(.priority),
				:deep(.action-item__menutoggle) {
					color: var(--color-text-maxcontrast);

					&:hover {
						color: var(--color-main-text);
					}
				}

				// The star, once set, in its priority color
				.action-item.priority {
					opacity: 1;

					&--high {
						color: $red_overdue;
					}

					&--medium {
						color: $yellow;
					}

					&--low {
						color: $blue_due;
					}
				}

				.calendar {
					color: var(--color-text-maxcontrast);
					font-size: 11px;
					line-height: 14px;
					white-space: nowrap;

					&__indicator {
						position: relative;
						display: inline-block;
						margin-right: 3px;
						width: 8px;
						height: 8px;
						border: none;
						border-radius: 50%;
						cursor: pointer
					}
					&__name {
						max-width: 200px;
						overflow: hidden;
						text-overflow: ellipsis;
					}
				}
			}
		}
	}

	// The "⋯" menu appears on hover, on keyboard focus and while it is open.
	// Devices without hover always show it.
	&__menu {
		opacity: 0;
	}

	&__body:hover &__menu,
	&__body:focus-within &__menu,
	&__menu:has([aria-expanded='true']) {
		opacity: 1;
	}

	@media (hover: none) {
		&__menu {
			opacity: 1;
		}
	}

	&__subtasks {
		margin-left: var(--default-clickable-area);

		@media only screen and (max-width: $breakpoint-mobile) {
			margin-left: calc(0.5 * var(--default-clickable-area));
		}
	}
}
</style>
