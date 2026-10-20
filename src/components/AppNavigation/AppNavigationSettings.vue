<!--
Nextcloud - Tasks

@author Raimund Schlüßler
@copyright 2018 Raimund Schlüßler <raimund.schluessler@mailbox.org>

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
	<NcAppNavigationSettings :name="appNavigationSettingsName">
		<div class="reactive">
			<ul>
				<li>
					<label for="defaultCalendar">
						{{ t('tasks', 'Default list') }}
					</label>
					<select id="defaultCalendar" v-model="defaultCalendarId">
						<option v-for="calendar in calendars"
							:key="calendar.id"
							:value="calendar.id">
							{{ calendar.displayName }}
						</option>
					</select>
				</li>
				<li class="rollover">
					<NcCheckboxRadioSwitch type="switch"
						:model-value="rollover"
						@update:model-value="setRollover">
						{{ t('tasks', 'Roll over unfinished tasks') }}
					</NcCheckboxRadioSwitch>
					<p class="rollover__hint">
						{{ t('tasks', 'Tasks not done by the end of their day move to the next day, reminders included.') }}
					</p>
				</li>
				<li class="parse-new">
					<NcCheckboxRadioSwitch type="switch"
						:model-value="parseNewTasks"
						@update:model-value="setParseNewTasks">
						{{ t('tasks', 'Read dates and places from new tasks') }}
					</NcCheckboxRadioSwitch>
				</li>
				<li class="headline">
					{{ t('tasks', 'Visibility of Smart Collections') }}
				</li>
				<li v-for="collection in collections"
					:key="collection.id"
					class="collection">
					<component :is="collection.icon" :size="20" />
					<span class="label-container">
						<label :for="'visibilityCollection-' + collection.id">
							{{ collection.displayName }}
						</label>
					</span>
					<select :id="'visibilityCollection-' + collection.id"
						:value="collection.show"
						@change="setVisibility({ id: collection.id, show: +$event.target.value })">
						<option v-for="collectionOption in collectionOptions"
							:key="collectionOption.id"
							:value="collectionOption.id">
							{{ collectionOption.name }}
						</option>
					</select>
				</li>
			</ul>
		</div>
	</NcAppNavigationSettings>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'
import moment from '@nextcloud/moment'
import NcAppNavigationSettings from '@nextcloud/vue/components/NcAppNavigationSettings'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'

import CalendarToday from 'vue-material-design-icons/CalendarToday.vue'
import CalendarWeek from 'vue-material-design-icons/CalendarWeek.vue'
import CircleOutline from 'vue-material-design-icons/CircleOutline.vue'
import Check from 'vue-material-design-icons/Check.vue'
import Star from 'vue-material-design-icons/StarOutline.vue'
import TrendingUp from 'vue-material-design-icons/TrendingUp.vue'

import { mapState, mapGetters, mapActions } from 'vuex'

export default {
	components: {
		NcAppNavigationSettings,
		NcCheckboxRadioSwitch,
		CalendarToday,
		CalendarWeek,
		CircleOutline,
		Check,
		Star,
		TrendingUp,
	},
	data() {
		return {
			collectionOptions: [
				{
					id: 0,
					name: t('tasks', 'Hidden'),
				},
				{
					id: 1,
					name: t('tasks', 'Visible'),
				},
				{
					id: 2,
					name: t('tasks', 'Automatic'),
				},
			],
			dayOfMonth: moment().date(),
		}
	},
	computed: {
		appNavigationSettingsName() {
			return t('tasks', 'Tasks settings')
		},

		defaultCalendarId: {
			get() {
				const cal = this.$store.getters.getDefaultCalendar
				return cal ? cal.id : ''
			},
			set(value) {
				this.$store.dispatch('setSetting', { type: 'defaultCalendarId', value })
			},
		},
		// Rollover is on unless the user turned it off (docs/ROLLOVER-DESIGN.md)
		rollover() {
			return this.$store.state.settings.settings.rollover !== false
		},
		// Reading new tasks is on unless the user turned it off
		parseNewTasks() {
			return this.$store.state.settings.settings.parseNewTasks !== false
		},
		...mapState({
			collections: state => state.collections.collections,
		}),
		...mapGetters({
			calendars: 'getSortedWritableCalendars',
		}),
	},
	methods: {
		t,

		...mapActions([
			'setVisibility',
		]),

		setRollover(on) {
			// Stored as various_rollover: '1' on, '0' off; the nightly job reads it
			this.$store.dispatch('setSetting', { type: 'rollover', value: on ? 1 : 0 })
		},

		setParseNewTasks(on) {
			// Stored as various_parseNewTasks: '1' on, '0' off; the server reads it on arrival
			this.$store.dispatch('setSetting', { type: 'parseNewTasks', value: on ? 1 : 0 })
		},
	},
}
</script>

<style lang="scss" scoped>
li {
	display: flex;
	align-items: center;
	height: 44px;

	&.headline {
		font-weight: bold;
	}

	// The switch with its explanation underneath: stacked, as tall as it needs
	&.rollover,
	&.parse-new {
		flex-direction: column;
		align-items: flex-start;
		height: auto;
		margin: 8px 0 12px;

		label {
			white-space: normal;
		}
	}

	.rollover__hint {
		margin: 0;
		// Lines up with the switch's label, not the switch itself
		padding-inline-start: 50px;
		color: var(--color-text-maxcontrast);
		font-size: .9em;
		line-height: 1.35;
	}

	&.collection {
		.material-design-icon {
			margin-right: 16px;
		}

		.label-container {
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
			display: flex;
			align-items: center;
		}
	}

	select {
		min-width: 105px;
		text-overflow: ellipsis;
		margin-left: auto;
	}

	label {
		white-space: nowrap;
		padding-right: 10px;
	}
}
</style>
