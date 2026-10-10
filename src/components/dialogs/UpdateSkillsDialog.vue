<script setup lang="ts">
import { completePersonalInfo } from '../../lib/personalInfoDefaults.ts'
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

const editableProfile = ref<PersonalInfo>(completePersonalInfo(props.personalInfo))
const skillDraft = ref('')
const saved = ref(false)
const dragIndex = ref<number | null>(null)
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
  emit('close')
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

// Order is meaningful — it becomes each skill row's display_order on save — so both the
// arrow buttons and drag-and-drop just reorder the same underlying array.
const moveSkill = (index: number, direction: -1 | 1) => {
  const skills = editableProfile.value.skills ?? []
  const target = index + direction
  if (target < 0 || target >= skills.length) return
  const reordered = [...skills]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  editableProfile.value.skills = reordered
  saved.value = false
}

const onDragStart = (index: number, event: DragEvent) => {
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const onDrop = (targetIndex: number) => {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === targetIndex) return

  const skills = [...(editableProfile.value.skills ?? [])]
  const [moved] = skills.splice(from, 1)
  skills.splice(targetIndex, 0, moved)
  editableProfile.value.skills = skills
  saved.value = false
}

const onDragEnd = () => {
  dragIndex.value = null
}

const handleSkillDraftKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSkillFromDraft()
  }
}

watch(
  () => (props.personalInfo.skills ?? []).join('\u0000'),
  (next, prev) => {
    if (!props.show || prev == null) return
    const previous = new Set(prev.split('\u0000').filter(Boolean).map((skill) => skill.toLowerCase()))
    const incoming = props.personalInfo.skills ?? []
    const added = incoming.filter((skill) => skill.trim() && !previous.has(skill.trim().toLowerCase()))
    if (!added.length) return
    const current = editableProfile.value.skills ?? []
    const seen = new Set(current.map((skill) => skill.toLowerCase()))
    const merged = [...current]
    for (const skill of added) {
      if (seen.has(skill.toLowerCase())) continue
      merged.push(skill)
      seen.add(skill.toLowerCase())
    }
    editableProfile.value = { ...editableProfile.value, skills: merged }
  },
)

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = completePersonalInfo(props.personalInfo)
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

      <div v-if="(editableProfile.skills ?? []).length > 0" class="skills-list">
        <div
          v-for="(skill, index) in editableProfile.skills"
          :key="skill"
          class="skill-row"
          :class="{ 'skill-row-dragging': dragIndex === index }"
          draggable="true"
          @dragstart="onDragStart(index, $event)"
          @dragover="onDragOver"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <span class="skill-row-index">{{ index + 1 }}</span>
          <span class="skill-row-name">{{ skill }}</span>
          <button
            type="button"
            class="skill-row-btn"
            title="Move up"
            :disabled="index === 0"
            @click="moveSkill(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="skill-row-btn"
            title="Move down"
            :disabled="index === (editableProfile.skills?.length ?? 0) - 1"
            @click="moveSkill(index, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="skill-row-btn skill-row-remove"
            title="Remove"
            @click="removeSkill(skill)"
          >
            ×
          </button>
        </div>
      </div>

      <div class="skills-hint">
        Order matters — the first skills are used when a form limits how many you can enter. Drag
        a row or use the arrows to reorder.
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

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-row {
  display: grid;
  grid-template-columns: 16px 1fr auto auto auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 8px;
  padding: 9px 11px;
  cursor: grab;
}

.skill-row:active {
  cursor: grabbing;
}

.skill-row-dragging {
  opacity: 0.4;
}

.skill-row-index {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #6f6f7a;
}

.skill-row-name {
  font-size: 12.5px;
  font-weight: 500;
  color: #ebebee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-row-btn {
  border: none;
  background: none;
  color: #7c7c86;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 5px;
}

.skill-row-btn:hover:not(:disabled) {
  color: #ebebee;
  background: #232329;
}

.skill-row-btn:disabled {
  color: #3a3a42;
  cursor: not-allowed;
}

.skill-row-remove:hover:not(:disabled) {
  color: #e08a8a;
  background: #232329;
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
