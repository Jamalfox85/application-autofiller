<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedResumeData } from '../../types'

const props = defineProps<{
  parsedData: ParsedResumeData & { fileName?: string }
}>()

const emit = defineEmits<{
  back: []
  continue: []
  replace: []
}>()

interface ReviewRow {
  key: string
  label: string
  value: string
  note: string
  ok: boolean
}

// Curated view of the parsed data — not every PersonalInfo field, just the ones worth a
// second look before the user lands on the main popup.
const rows = computed<ReviewRow[]>(() => {
  const data = props.parsedData
  const notes = data.fieldNotes || {}
  const latestExperience = data.experience?.[0]
  const latestEducation = data.education?.[0]

  const entries: Array<{ key: string; label: string; value: string; required: boolean }> = [
    {
      key: 'firstName',
      label: 'Full name',
      value: [data.firstName, data.lastName].filter(Boolean).join(' '),
      required: true,
    },
    { key: 'email', label: 'Email', value: data.email || '', required: true },
    { key: 'phone', label: 'Phone', value: data.phone || '', required: false },
    {
      key: 'jobTitle',
      label: 'Most recent role',
      value: latestExperience
        ? [latestExperience.jobTitle, latestExperience.companyName].filter(Boolean).join(', ')
        : '',
      required: false,
    },
    {
      key: 'city',
      label: 'Location',
      value: [data.city, data.state].filter(Boolean).join(', '),
      required: false,
    },
    {
      key: 'graduationYear',
      label: 'Graduation year',
      value: latestEducation?.graduationYear || '',
      required: false,
    },
  ]

  return entries.map((entry) => {
    const backendNote = notes[entry.key as keyof typeof notes]
    if (backendNote) {
      return { ...entry, note: backendNote, ok: false }
    }
    if (!entry.value) {
      return { ...entry, note: 'Not found in resumé', ok: !entry.required }
    }
    return { ...entry, note: '', ok: true }
  })
})

const needsAttentionCount = computed(() => rows.value.filter((r) => !r.ok).length)
</script>

<template>
  <div class="onboarding-screen">
    <div class="onboarding-header">
      <div class="header-left">
        <button class="back-btn" @click="$emit('back')">←</button>
        <span class="header-title">Check what we found</span>
      </div>
      <span class="step-label">Step 2 of 3</span>
    </div>

    <div class="file-chip-wrap">
      <div class="file-chip">
        <div class="file-chip-main">
          <div class="file-name">{{ parsedData.fileName || 'resumé' }}</div>
          <div class="file-meta">
            {{ rows.length }} fields read
            <template v-if="needsAttentionCount > 0"> · {{ needsAttentionCount }} need your attention</template>
          </div>
        </div>
        <button class="replace-btn" @click="$emit('replace')">Replace</button>
      </div>
    </div>

    <div class="fields-list">
      <div v-for="row in rows" :key="row.key" class="field-row" :class="{ warn: !row.ok }">
        <div class="field-row-top">
          <span class="field-label">{{ row.label }}</span>
          <span v-if="row.note" class="field-note">{{ row.note }}</span>
        </div>
        <div class="field-value" :class="{ empty: !row.value }">
          {{ row.value || 'Add manually' }}
        </div>
      </div>
    </div>

    <div class="onboarding-footer">
      <button class="back-link" @click="$emit('back')">Back</button>
      <button class="continue-btn" @click="$emit('continue')">Looks right — continue</button>
    </div>
  </div>
</template>

<style scoped>
.onboarding-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.onboarding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
}

.header-left {
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

.header-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.step-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.file-chip-wrap {
  padding: 13px 13px 0;
  flex-shrink: 0;
}

.file-chip {
  border: 1px solid #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
  border-radius: 10px;
  padding: 11px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.file-chip-main {
  min-width: 0;
}

.file-name {
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 11px;
  color: #8f8f99;
  margin-top: 4px;
}

.replace-btn {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  padding: 5px 9px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}

.replace-btn:hover {
  color: #ebebee;
  border-color: #47475a;
}

.fields-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field-row {
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 8px;
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-row.warn {
  border-color: #3d3320;
  background: #1c1810;
}

.field-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c7c86;
}

.field-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #e8b062;
}

.field-value {
  font-size: 12.5px;
  color: #ebebee;
}

.field-value.empty {
  color: #5c5c66;
  font-style: italic;
}

.onboarding-footer {
  border-top: 1px solid #22222a;
  padding: 11px 13px;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.back-link {
  flex-shrink: 0;
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 8px;
  padding: 9px 13px;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
}

.back-link:hover {
  color: #ebebee;
}

.continue-btn {
  flex: 1;
  border: none;
  background: #7c3aed;
  color: #fff;
  border-radius: 8px;
  padding: 9px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.continue-btn:hover {
  background: #8b5cf6;
}
</style>
