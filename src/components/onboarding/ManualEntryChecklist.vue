<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { CORE_SECTIONS } from '@/utils/infocards.ts'
import type { PersonalInfo } from '../../types'
import UpdatePersonalInfoDialog from '../dialogs/UpdatePersonalInfoDialog.vue'
import UpdateExperienceDialog from '../dialogs/UpdateExperienceDialog.vue'
import UpdateEducationDialog from '../dialogs/UpdateEducationDialog.vue'
import UpdateLinksDialog from '../dialogs/UpdateLinksDialog.vue'
import UpdateOtherInfoDialog from '../dialogs/UpdateOtherInfoDialog.vue'
import UpdateEEODialog from '../dialogs/UpdateEEODialog.vue'

const props = defineProps<{
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  save: [profile: PersonalInfo]
  finishLater: []
}>()

// Reuses the exact same section-editing components used from the main popup's row list —
// only the surrounding checklist/progress chrome is new, so multi-entry Experience/Education
// editing and every other field stay identical between the two entry points.
const DIALOG_COMPONENTS: Record<string, unknown> = {
  personal: UpdatePersonalInfoDialog,
  experience: UpdateExperienceDialog,
  education: UpdateEducationDialog,
  links: UpdateLinksDialog,
  authorization: UpdateOtherInfoDialog,
  demographics: UpdateEEODialog,
}

const openKey = ref<string | null>(null)

const doneCount = computed(() => CORE_SECTIONS.filter((s) => s.done(props.personalInfo)).length)
const progressPct = computed(() => Math.round((doneCount.value / CORE_SECTIONS.length) * 100))
const nextIncompleteKey = computed(
  () => CORE_SECTIONS.find((s) => !s.done(props.personalInfo))?.key ?? CORE_SECTIONS[0].key,
)

const openSection = (key: string) => {
  openKey.value = key
}

const closeSection = () => {
  openKey.value = null
}

const handleSectionSave = (profile: PersonalInfo) => {
  emit('save', profile)

  // Auto-advance to the next not-yet-done section, matching the design's "Save & next" flow.
  // Every dialog's handleSave() emits 'save' immediately followed by its own 'close' (which
  // calls closeSection and would null this right back out) — deferring to nextTick lets our
  // assignment run after that synchronous 'close' has already landed.
  const currentIndex = CORE_SECTIONS.findIndex((s) => s.key === openKey.value)
  const next = CORE_SECTIONS.slice(currentIndex + 1).find((s) => !s.done(profile))
  nextTick(() => {
    openKey.value = next ? next.key : null
  })
}
</script>

<template>
  <div class="onboarding-screen">
    <div class="onboarding-header">
      <div class="header-left">
        <span class="header-title">Build your profile</span>
      </div>
      <span class="step-label">Step 2 of 3</span>
    </div>

    <div class="checklist-intro">
      <div class="intro-text">
        Only the first two are needed to start filling. Add the rest as applications ask for
        them.
      </div>
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <span class="progress-label">{{ doneCount }}/{{ CORE_SECTIONS.length }}</span>
      </div>
    </div>

    <div class="checklist-rows">
      <button
        v-for="section in CORE_SECTIONS"
        :key="section.key"
        class="checklist-row"
        :class="{ done: section.done(personalInfo) }"
        @click="openSection(section.key)"
      >
        <div class="checklist-row-main">
          <div class="checklist-row-title">{{ section.title }}</div>
          <div class="checklist-row-meta">{{ section.meta(personalInfo) }}</div>
        </div>
        <span class="checklist-req">{{ section.required ? 'Required' : 'Optional' }}</span>
        <span class="checklist-dot" :class="{ done: section.done(personalInfo) }"></span>
      </button>
    </div>

    <div class="onboarding-footer">
      <button class="finish-later-btn" @click="$emit('finishLater')">Finish later</button>
      <button class="continue-btn" @click="openSection(nextIncompleteKey)">Continue</button>
    </div>

    <component
      :is="DIALOG_COMPONENTS[section.key]"
      v-for="section in CORE_SECTIONS"
      :key="section.key"
      :show="openKey === section.key"
      :personalInfo="personalInfo"
      @close="closeSection"
      @save="handleSectionSave"
    />
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

.checklist-intro {
  padding: 15px 16px 12px;
  flex-shrink: 0;
}

.intro-text {
  font-size: 12.5px;
  color: #8f8f99;
  line-height: 1.5;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
}

.progress-track {
  flex: 1;
  height: 4px;
  border-radius: 4px;
  background: #1e1e24;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #7c3aed;
  transition: width 0.2s ease;
}

.progress-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.checklist-rows {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checklist-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 8px;
  padding: 11px;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.checklist-row:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.checklist-row.done {
  border-color: #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
}

.checklist-row-main {
  min-width: 0;
}

.checklist-row-title {
  font-size: 12.5px;
  font-weight: 500;
}

.checklist-row-meta {
  font-size: 11px;
  color: #8f8f99;
  margin-top: 2px;
}

.checklist-req {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c7c86;
}

.checklist-row.done .checklist-req {
  color: #c4b5fd;
}

.checklist-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid #4a4a55;
}

.checklist-dot.done {
  background: #7c3aed;
  border: none;
}

.onboarding-footer {
  border-top: 1px solid #22222a;
  padding: 11px 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.finish-later-btn {
  flex-shrink: 0;
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 8px;
  padding: 9px 13px;
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.finish-later-btn:hover {
  color: #ebebee;
}

.continue-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
