<!--
  - SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Shows, for as long as it is active, that the list is filtered and by what,
with a way to undo each part and all of it. Clicking a tag filters the list in
one click, and without this the only sign was the filter icon changing.
-->
<template>
	<div v-if="isFiltered" class="filter-bar" role="status">
		<div class="filter-bar__row">
			<span class="filter-bar__label">{{ t('tasks', 'Filtered by') }}</span>
			<NcChip v-for="tag in filter.tags"
				:key="'tag-' + tag"
				:text="tag"
				:aria-label-close="t('tasks', 'Remove the tag {tag} from the filter', { tag })"
				class="filter-bar__chip"
				@close="removeTag(tag)">
				<template #icon>
					<TagIcon :size="16" />
				</template>
			</NcChip>
			<NcChip v-if="searchQuery"
				:text="t('tasks', '“{query}”', { query: searchQuery })"
				:aria-label-close="t('tasks', 'Clear the search')"
				class="filter-bar__chip"
				@close="setSearchQuery('')">
				<template #icon>
					<MagnifyIcon :size="16" />
				</template>
			</NcChip>
			<NcButton variant="tertiary"
				size="small"
				class="filter-bar__clear"
				@click="clearAll">
				{{ t('tasks', 'Clear') }}
			</NcButton>
		</div>
		<p v-if="visibleCount === 0" class="filter-bar__empty">
			{{ t('tasks', 'No open tasks match the filter.') }}
		</p>
	</div>
</template>

<script>
import { translate as t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcChip from '@nextcloud/vue/components/NcChip'

import MagnifyIcon from 'vue-material-design-icons/Magnify.vue'
import TagIcon from 'vue-material-design-icons/TagOutline.vue'

import { mapGetters, mapMutations } from 'vuex'

export default {
	name: 'FilterBar',
	components: {
		NcButton,
		NcChip,
		MagnifyIcon,
		TagIcon,
	},
	computed: {
		...mapGetters({
			filter: 'filter',
			searchQuery: 'searchQuery',
			calendarCount: 'getCalendarCount',
			collectionCount: 'getCollectionCount',
		}),

		isFiltered() {
			return this.filter.tags.length > 0 || this.searchQuery !== ''
		},

		/**
		 * How many open tasks the current page still shows under the filter
		 *
		 * @return {number|null} null when it cannot be told
		 */
		visibleCount() {
			const { calendarId, collectionId } = this.$route.params
			if (calendarId) {
				return this.calendarCount(calendarId)
			}
			if (collectionId && collectionId !== 'completed') {
				return this.collectionCount(collectionId)
			}
			return null
		},
	},
	methods: {
		t,
		...mapMutations(['setFilter', 'setSearchQuery']),

		removeTag(tag) {
			this.setFilter({ ...this.filter, tags: this.filter.tags.filter(t => t !== tag) })
		},

		clearAll() {
			this.setFilter({ ...this.filter, tags: [] })
			this.setSearchQuery('')
		},
	},
}
</script>

<style lang="scss" scoped>
.filter-bar {
	margin-top: calc(2 * var(--default-grid-baseline));
	margin-right: calc(2 * var(--default-grid-baseline));

	&__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--default-grid-baseline) calc(2 * var(--default-grid-baseline));
	}

	&__label {
		color: var(--color-text-maxcontrast);
	}

	&__empty {
		margin-top: calc(3 * var(--default-grid-baseline));
		color: var(--color-text-maxcontrast);
	}
}
</style>
