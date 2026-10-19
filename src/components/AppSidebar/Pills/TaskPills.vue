<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
The row of pills at the top of the task panel's Details tab: due date, each
reminder, repeat and each tag (docs/TASK-PANEL-DESIGN.md). A pill shows its
value, or unset its name in gray; clicking it opens its picker.
-->
<template>
	<div class="task-pills">
		<NcPopover v-if="!readOnly || task.due"
			:shown="open === 'due'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton class="pill--due"
					:icon="CalendarBlankOutline"
					:label="dueLabel || t('tasks', 'Due date')"
					:aria-label="dueLabel ? t('tasks', 'Due {date}', { date: dueLabel }) : t('tasks', 'Set a due date')"
					:set="!!dueLabel"
					:late="dueLate"
					:clearable="!!dueLabel"
					:clear-label="t('tasks', 'Remove the due date')"
					:disabled="readOnly"
					@open="toggle('due')"
					@clear="clearDue" />
			</template>
			<DuePicker v-if="mounted === 'due'"
				:task="task"
				@due-changed="announce"
				@done="close" />
		</NcPopover>

		<NcPopover v-for="reminder in reminders"
			:key="'reminder-' + reminder.index"
			:shown="open === 'reminder-' + reminder.index"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton :icon="BellOutline"
					:label="reminder.label"
					:aria-label="t('tasks', 'Reminder: {when}', { when: reminder.label })"
					:set="true"
					:clearable="true"
					:clear-label="t('tasks', 'Remove this reminder')"
					:disabled="readOnly"
					@open="toggle('reminder-' + reminder.index)"
					@clear="removeReminder(reminder.index)" />
			</template>
			<ReminderPicker v-if="mounted === 'reminder-' + reminder.index"
				:task="task"
				:index="reminder.index"
				@custom="custom('editReminders')"
				@done="close" />
		</NcPopover>

		<NcPopover v-if="!readOnly"
			:shown="open === 'reminder-new'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton :icon="reminders.length ? Plus : BellOutline"
					:label="t('tasks', 'Reminder')"
					:aria-label="reminders.length ? t('tasks', 'Add another reminder') : t('tasks', 'Add a reminder')"
					@open="toggle('reminder-new')" />
			</template>
			<ReminderPicker v-if="mounted === 'reminder-new'"
				:task="task"
				@custom="custom('editReminders')"
				@done="close" />
		</NcPopover>

		<NcPopover v-if="(task.due || task.start) && (!readOnly || task.isRecurring)"
			:shown="open === 'repeat'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton :icon="Repeat"
					:label="repeatLabel || t('tasks', 'Repeat')"
					:set="!!repeatLabel"
					:clearable="!!repeatLabel"
					:clear-label="t('tasks', 'Stop repeating')"
					:disabled="readOnly"
					@open="toggle('repeat')"
					@clear="clearRepeat" />
			</template>
			<RepeatPicker v-if="mounted === 'repeat'"
				:task="task"
				@custom="custom('editRepeat')"
				@done="close" />
		</NcPopover>

		<NcPopover v-for="tag in task.tags"
			:key="'tag-' + tag"
			:shown="open === 'tag-' + tag"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton :icon="TagOutline"
					:label="tag"
					:aria-label="t('tasks', 'Tag {tag}', { tag })"
					:set="true"
					:clearable="true"
					:clear-label="t('tasks', 'Remove the tag {tag}', { tag })"
					:disabled="readOnly"
					@open="toggle('tag-' + tag)"
					@clear="removeTag(tag)" />
			</template>
			<TagsPicker v-if="mounted === 'tag-' + tag" :task="task" @done="close" />
		</NcPopover>

		<NcPopover v-if="!readOnly"
			:shown="open === 'tag-new'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()"
			@after-hide="mounted = open">
			<template #trigger>
				<PillButton :icon="task.tags.length ? Plus : TagOutline"
					:label="task.tags.length ? t('tasks', 'Tag') : t('tasks', 'Add tag')"
					:aria-label="t('tasks', 'Add a tag')"
					@open="toggle('tag-new')" />
			</template>
			<TagsPicker v-if="mounted === 'tag-new'" :task="task" @done="close" />
		</NcPopover>
	</div>
</template>

<script>
import DuePicker from './DuePicker.vue'
import PillButton from './PillButton.vue'
import ReminderPicker from './ReminderPicker.vue'
import RepeatPicker from './RepeatPicker.vue'
import TagsPicker from './TagsPicker.vue'
import formatRecurrenceRule from '../../../filters/recurrenceRuleFormat.js'
import { fixedReminders, reminderLabel } from '../../../utils/reminders.js'
import { repeatPreset, repeatPresets } from '../../../utils/repeatPresets.js'
import { shortDateLabel } from '../../../utils/rowDate.js'

import { showUndo } from '@nextcloud/dialogs'
import { translate as t, translatePlural as n, getCanonicalLocale } from '@nextcloud/l10n'
import NcPopover from '@nextcloud/vue/components/NcPopover'

import BellOutline from 'vue-material-design-icons/BellOutline.vue'
import CalendarBlankOutline from 'vue-material-design-icons/CalendarBlankOutline.vue'
import Plus from 'vue-material-design-icons/Plus.vue'
import Repeat from 'vue-material-design-icons/Repeat.vue'
import TagOutline from 'vue-material-design-icons/TagOutline.vue'

import { markRaw } from 'vue'

export default {
	name: 'TaskPills',
	components: {
		DuePicker,
		NcPopover,
		PillButton,
		ReminderPicker,
		RepeatPicker,
		TagsPicker,
	},
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
	emits: ['editReminders', 'editRepeat'],
	data() {
		return {
			// Which picker is open: 'due', 'reminder-<index>', 'reminder-new', 'repeat', 'tag-<tag>', 'tag-new'
			open: null,
			// Which picker's content is mounted. It stays until its popover has
			// finished hiding: removing it first leaves the popover's focus trap
			// with nothing to focus, which throws.
			mounted: null,
			BellOutline: markRaw(BellOutline),
			CalendarBlankOutline: markRaw(CalendarBlankOutline),
			Plus: markRaw(Plus),
			Repeat: markRaw(Repeat),
			TagOutline: markRaw(TagOutline),
		}
	},
	computed: {
		due() {
			return this.task.dueMoment.isValid() ? this.task.dueMoment.toDate() : null
		},

		dueLabel() {
			return this.due ? shortDateLabel(this.due, !this.task.allDay, new Date(), getCanonicalLocale()) : ''
		},

		dueLate() {
			if (!this.due || this.task.completed) {
				return false
			}
			const now = new Date()
			if (this.task.allDay) {
				return new Date(this.due.getFullYear(), this.due.getMonth(), this.due.getDate()) < new Date(now.getFullYear(), now.getMonth(), now.getDate())
			}
			return this.due < now
		},

		reminders() {
			return this.task.alarms.map((alarm, index) => ({
				index,
				label: reminderLabel(alarm, this.task, { locale: getCanonicalLocale() }),
			}))
		},

		repeatLabel() {
			if (!this.task.isRecurring) {
				return ''
			}
			const preset = repeatPreset(this.task)
			return preset
				? repeatPresets().find(p => p.key === preset).label
				: formatRecurrenceRule(this.task.recurrenceRule)
		},
	},
	methods: {
		t,

		toggle(which) {
			if (this.readOnly) {
				return
			}
			this.open = this.open === which ? null : which
			if (this.open) {
				this.mounted = this.open
			}
		},

		close() {
			this.open = null
		},

		/**
		 * Closes the picker and asks the panel for the full editor.
		 *
		 * @param {string} event 'editReminders' or 'editRepeat'
		 */
		custom(event) {
			this.close()
			this.$emit(event)
		},

		/**
		 * Says what the automatic-reminder rule did on a due-date change, with Undo.
		 *
		 * @param {{added: Date|null, removed: Date[]}} result What setDue reported
		 */
		announce(result) {
			if (!result || (!result.added && !result.removed?.length)) {
				return
			}
			// Bound now: the panel reuses this component when another task is opened
			const task = this.task
			const undo = () => this.$store.dispatch('undoReminderChange', { task, ...result })
			if (result.added) {
				const minute = date => Math.floor(date.getTime() / 60000)
				const added = fixedReminders(this.task.alarms).find(reminder => minute(reminder.at) === minute(result.added))
				const when = added ? reminderLabel(this.task.alarms[added.index], this.task, { locale: getCanonicalLocale() }) : ''
				showUndo(t('tasks', 'Reminder set: {when}', { when }), undo)
			} else {
				showUndo(n('tasks', 'Reminder removed', 'Reminders removed', result.removed.length), undo)
			}
		},

		async clearDue() {
			this.close()
			this.announce(await this.$store.dispatch('setDue', { task: this.task, due: null, allDay: this.task.allDay }))
		},

		removeReminder(index) {
			this.close()
			return this.$store.dispatch('removeAlarm', { task: this.task, indexes: [index] })
		},

		clearRepeat() {
			this.close()
			return this.$store.dispatch('removeRecurrenceRule', { task: this.task })
		},

		removeTag(tag) {
			this.close()
			return this.$store.dispatch('setTags', { task: this.task, tags: this.task.tags.filter(t => t !== tag) })
		},
	},
}
</script>

<style lang="scss" scoped>
.task-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding-block: 4px 12px;

	:deep(.v-popper) {
		display: inline-flex;
		max-width: 100%;
	}
}
</style>
