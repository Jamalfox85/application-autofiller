<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFillHistory } from '../composables/useFillHistory'
import type { FillHistoryEntry } from '../types'

const emit = defineEmits<{
  back: []
}>()

const { fillHistory, loadFillHistory, clearFillHistory } = useFillHistory()
const filter = ref<'All' | 'Complete' | 'Needs review'>('All')

onMounted(async () => {
  await loadFillHistory()
})

const isComplete = (entry: FillHistoryEntry) => entry.filledCount >= entry.totalCount

const filledThisWeek = computed(() => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return fillHistory.value.filter((e) => e.timestamp >= weekAgo).length
})

// Rough estimate — not exact, just gives the stat some meaning (~3.5 min saved per fill).
const minutesSaved = computed(() => Math.round(filledThisWeek.value * 3.5))

const filtered = computed(() =>
  fillHistory.value.filter((e) => {
    if (filter.value === 'Complete') return isComplete(e)
    if (filter.value === 'Needs review') return !isComplete(e)
    return true
  }),
)

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(date, now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return 'Yesterday'

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const groups = computed(() => {
  const byDay = new Map<string, FillHistoryEntry[]>()
  for (const entry of filtered.value) {
    const label = dayLabel(entry.timestamp)
    if (!byDay.has(label)) byDay.set(label, [])
    byDay.get(label)!.push(entry)
  }
  return Array.from(byDay.entries()).map(([when, items]) => ({ when, items }))
})

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function siteInitial(site: string): string {
  return site.charAt(0).toUpperCase()
}

const handleClear = async () => {
  await clearFillHistory()
}

const handleExport = () => {
  const payload = JSON.stringify(fillHistory.value, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gofillr-history-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="history-view">
    <div class="history-header">
      <div class="history-header-left">
        <button class="back-btn" @click="$emit('back')">←</button>
        <span class="history-title">History</span>
      </div>
      <button class="export-btn" :disabled="fillHistory.length === 0" @click="handleExport">
        Export
      </button>
    </div>

    <div class="history-stats">
      <div class="stat-card">
        <div class="stats-row">
          <div>
            <div class="stat-number">{{ filledThisWeek }}</div>
            <div class="stat-label">filled this week</div>
          </div>
          <div class="stat-right">
            <div class="stat-number accent">{{ minutesSaved }}m</div>
            <div class="stat-label">time saved</div>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-row">
      <button
        v-for="f in ['All', 'Complete', 'Needs review'] as const"
        :key="f"
        class="filter-chip"
        :class="{ active: filter === f }"
        @click="filter = f"
      >
        {{ f }}
      </button>
    </div>

    <div class="history-list">
      <div v-if="groups.length === 0" class="empty-history">
        <p>No fills yet.</p>
        <p class="hint">Once you autofill an application, it'll show up here.</p>
      </div>
      <div v-for="group in groups" :key="group.when" class="history-group">
        <div class="group-label">{{ group.when }}</div>
        <div
          v-for="entry in group.items"
          :key="entry.id"
          class="history-row"
        >
          <span class="history-badge">{{ siteInitial(entry.site) }}</span>
          <div class="history-row-main">
            <div class="history-role">{{ entry.role }}</div>
            <div class="history-site">{{ entry.site }}</div>
          </div>
          <div class="history-row-right">
            <div class="history-ratio" :class="{ warn: !isComplete(entry) }">
              {{ entry.filledCount }}/{{ entry.totalCount }}
            </div>
            <div class="history-time">{{ formatTime(entry.timestamp) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="history-footer">
      <span class="footer-note">Kept for 90 days</span>
      <button class="footer-link" @click="handleClear">Clear history</button>
    </div>
  </div>
</template>

<style scoped>
.history-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
}

.history-header-left {
  display: flex;
  align-items: center;
  gap: 9px;
}

.back-btn {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
}

.back-btn:hover {
  color: #ebebee;
  border-color: #47475a;
}

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: #ebebee;
  letter-spacing: -0.01em;
}

.export-btn {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  padding: 4px 9px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.export-btn:hover:not(:disabled) {
  color: #ebebee;
  border-color: #47475a;
}

.export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.history-stats {
  padding: 13px 13px 0;
  flex-shrink: 0;
}

.stat-card {
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 10px;
  padding: 11px 12px;
}

.stats-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.stat-right {
  text-align: right;
}

.stat-number {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: #ebebee;
}

.stat-number.accent {
  color: #a78bfa;
}

.stat-label {
  font-size: 11px;
  color: #7c7c86;
  margin-top: 3px;
}

.filter-row {
  padding: 11px 13px 9px;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.filter-chip {
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #8f8f99;
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}

.filter-chip.active {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 13px 13px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-history {
  text-align: center;
  padding: 40px 20px;
  color: #7c7c86;
  font-size: 13px;
}

.empty-history .hint {
  font-size: 11.5px;
  color: #5c5c66;
  margin-top: 6px;
}

.group-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #6f6f7a;
  padding: 2px 0 5px;
}

.history-row {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 8px;
  padding: 9px 11px;
  margin-bottom: 5px;
}

.history-badge {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  background: #1e1e24;
  border: 1px solid #2b2b33;
  color: #8f8f99;
}

.history-row-main {
  min-width: 0;
}

.history-role {
  font-size: 12.5px;
  font-weight: 500;
  color: #ebebee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-site {
  font-size: 11px;
  color: #7c7c86;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-row-right {
  text-align: right;
}

.history-ratio {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #8f8f99;
}

.history-ratio.warn {
  color: #e8b062;
}

.history-time {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #5c5c66;
  margin-top: 3px;
}

.history-footer {
  border-top: 1px solid #22222a;
  padding: 9px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.footer-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.footer-link {
  background: none;
  border: none;
  color: #a78bfa;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.footer-link:hover {
  color: #c4b5fd;
}
</style>
