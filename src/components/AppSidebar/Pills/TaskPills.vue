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
			@update:shown="shown => shown || close()">
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
			<div class="picker" />
		</NcPopover>

		<NcPopover v-for="reminder in reminders"
			:key="'reminder-' + reminder.index"
			:shown="open === 'reminder-' + reminder.index"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()">
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
			<div class="picker" />
		</NcPopover>

		<NcPopover v-if="!readOnly"
			:shown="open === 'reminder-new'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()">
			<template #trigger>
				<PillButton :icon="reminders.length ? Plus : BellOutline"
					:label="t('tasks', 'Reminder')"
					:aria-label="reminders.length ? t('tasks', 'Add another reminder') : t('tasks', 'Add a reminder')"
					@open="toggle('reminder-new')" />
			</template>
			<div class="picker" />
		</NcPopover>

		<NcPopover v-if="(task.due || task.start) && (!readOnly || task.isRecurring)"
			:shown="open === 'repeat'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()">
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
			<div class="picker" />
		</NcPopover>

		<NcPopover v-for="tag in task.tags"
			:key="'tag-' + tag"
			:shown="open === 'tag-' + tag"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()">
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
			<div class="picker" />
		</NcPopover>

		<NcPopover v-if="!readOnly"
			:shown="open === 'tag-new'"
			:triggers="[]"
			popup-role="dialog"
			@update:shown="shown => shown || close()">
			<template #trigger>
				<PillButton :icon="task.tags.length ? Plus : TagOutline"
					:label="task.tags.length ? t('tasks', 'Tag') : t('tasks', 'Add tag')"
					:aria-label="t('tasks', 'Add a tag')"
					@open="toggle('tag-new')" />
			</template>
			<div class="picker" />
		</NcPopover>
	</div>
</template>

<script>
import PillButton from './PillButton.vue'
import formatRecurrenceRule from '../../../filters/recurrenceRuleFormat.js'
import { reminderLabel } from '../../../utils/reminders.js'
import { shortDateLabel } from '../../../utils/rowDate.js'

import { translate as t, getCanonicalLocale } from '@nextcloud/l10n'
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
		NcPopover,
		PillButton,
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
	data() {
		return {
			// Which picker is open: 'due', 'reminder-<index>', 'reminder-new', 'repeat', 'tag-<tag>', 'tag-new'
			open: null,
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
			return this.task.isRecurring ? formatRecurrenceRule(this.task.recurrenceRule) : ''
		},
	},
	methods: {
		t,

		toggle(which) {
			if (this.readOnly) {
				return
			}
			this.open = this.open === which ? null : which
		},

		close() {
			this.open = null
		},

		clearDue() {
			this.close()
			return this.$store.dispatch('setDue', { task: this.task, due: null, allDay: this.task.allDay })
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
