<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import type { PersonalInfo } from '../../types/index.ts'
import SectionSheet from './SectionSheet.vue'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  save: [profile: PersonalInfo]
}>()

const editableProfile = ref<PersonalInfo>({
  ...props.personalInfo,
})
const skillDraft = ref('')
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | undefined

const skillDupe = computed(
  () =>
    skillDraft.value.trim().length > 0 &&
    (editableProfile.value.skills ?? []).some(
      (s) => s.toLowerCase() === skillDraft.value.trim().toLowerCase(),
    ),
)

const handleClose = () => {
  emit('close')
}

const handleSave = () => {
  emit('save', editableProfile.value)
  saved.value = true
  clearTimeout(savedTimeout)
  savedTimeout = setTimeout(() => {
    saved.value = false
  }, 2200)
}

const addSkillFromDraft = () => {
  const value = skillDraft.value.trim()
  if (!value) return
  if (!editableProfile.value.skills) editableProfile.value.skills = []
  if (editableProfile.value.skills.some((s) => s.toLowerCase() === value.toLowerCase())) return
  editableProfile.value.skills.push(value)
  skillDraft.value = ''
  saved.value = false
}

const removeSkill = (skill: string) => {
  editableProfile.value.skills = (editableProfile.value.skills ?? []).filter((s) => s !== skill)
  saved.value = false
}

const handleSkillDraftKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSkillFromDraft()
  }
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
      skillDraft.value = ''
      saved.value = false
    }
  },
)

onBeforeUnmount(() => clearTimeout(savedTimeout))
</script>
<template>
  <SectionSheet
    :show="show"
    title="Skills"
    subtitle="List your key skills"
    fullscreen
    @close="handleClose"
  >
    <div class="skills-form">
      <div class="skills-add">
        <div class="skills-add-header">
          <span class="fs-group-label">Add a skill</span>
          <span class="skills-count">{{ (editableProfile.skills ?? []).length }} added</span>
        </div>
        <input
          v-model="skillDraft"
          type="text"
          placeholder="Type a skill and press Enter"
          @keydown="handleSkillDraftKeydown"
        />
        <span v-if="skillDupe" class="skills-dupe">Already in your list</span>
      </div>

      <div v-if="(editableProfile.skills ?? []).length > 0" class="skills-chips">
        <span v-for="skill in editableProfile.skills" :key="skill" class="skill-chip">
          {{ skill }}
          <button type="button" title="Remove" @click="removeSkill(skill)">×</button>
        </span>
      </div>

      <div class="skills-hint">
        Order matters — the first skills are used when a form limits how many you can enter.
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button
        class="btn-primary-dialog"
        :class="{ 'save-btn-saved': saved }"
        @click="handleSave"
      >
        {{ saved ? 'Saved' : 'Save changes' }}
      </button>
    </template>
  </SectionSheet>
</template>

<style scoped>
.skills-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skills-add {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.skills-add-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.skills-count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #6f6f7a;
}

.skills-add input {
  border: 1px solid #2b2b33;
  background: #101014;
  color: #ebebee;
  border-radius: 8px;
  padding: 10px 11px;
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.skills-add input:focus {
  border-color: #7c3aed;
}

.skills-dupe {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: #e8b062;
}

.skills-dupe::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #e8b062;
  flex-shrink: 0;
}

.skills-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #ebebee;
  border: 1px solid #33333d;
  background: #1b1b21;
  border-radius: 20px;
  padding: 5px 6px 5px 11px;
  white-space: nowrap;
}

.skill-chip button {
  border: none;
  background: none;
  color: #7c7c86;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 0 3px;
}

.skill-chip button:hover {
  color: #ebebee;
}

.skills-hint {
  font-size: 11px;
  color: #6f6f7a;
  line-height: 1.5;
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
