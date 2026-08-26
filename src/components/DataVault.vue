<script setup lang="ts">
import { SECTIONS } from '@/utils/infocards.ts'
import type { PersonalInfo } from '../types/index.ts'

const props = defineProps<{
  personalInfo: PersonalInfo
}>()
const emit = defineEmits<{
  openDialog: [dialogName: string]
}>()
</script>
<template>
  <div class="section-list">
    <button
      v-for="section in SECTIONS"
      :key="section.key"
      class="section-row"
      @click="$emit('openDialog', section.dialog)"
    >
      <span class="section-num">{{ section.num }}</span>
      <span class="section-label">{{ section.title }}</span>
      <span class="section-meta">{{ section.meta(personalInfo) }}</span>
      <span class="section-dot" :class="{ done: section.done(personalInfo) }"></span>
    </button>
  </div>
</template>
<style>
.section-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.section-row {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 8px;
  padding: 9px 11px;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.section-row:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.section-num {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #6f6f7a;
}

.section-label {
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-meta {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #7c7c86;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.section-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid #4a4a55;
  flex-shrink: 0;
}

.section-dot.done {
  background: #7c3aed;
  border: none;
}
</style>
