<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { usStates } from '../../utils/locationLists.ts'
import type { PersonalInfo } from '../../types/index.ts'
import { NTag, NInput } from 'naive-ui'

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
const skillInput = ref('')

const handleSave = () => {
  emit('save', editableProfile.value)
  handleClose()
}

const handleClose = () => {
  emit('close')
}

function addTagFromInput() {
  const raw = skillInput.value.trim()
  if (!raw) return

  // Optional: allow comma-separated paste, still creates multiple tags
  const parts = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  for (const p of parts) {
    // Optional normalization
    const normalized = p.toLowerCase()

    if (editableProfile.value.skills && !editableProfile.value.skills.includes(normalized)) {
      editableProfile.value.skills.push(normalized)
    }
  }

  skillInput.value = ''
}

function removeTag(tag: string) {
  if (!editableProfile.value.skills) return
  editableProfile.value.skills = editableProfile.value.skills.filter((t) => t !== tag)
}

function handleEditTagInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    addTagFromInput()
  }
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
    }
  },
)
</script>
<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Edit Skills</h2>
          <button class="close-btn" @click="handleClose">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div class="dialog-content">
          <form @submit.prevent="handleSave" class="edit-profile-form">
            <div class="form-section">
              <div class="section-header">
                <h3>Skills</h3>
              </div>

              <NInput
                v-model:value="skillInput"
                placeholder="Type a skill and press Enter"
                @keydown="handleEditTagInputKeydown"
                @blur="addTagFromInput"
              />
              <div
                v-if="editableProfile.skills && editableProfile.skills.length > 0"
                class="tags-list"
                style="margin-bottom: 8px"
              >
                <NTag
                  v-for="skill in editableProfile.skills"
                  :key="skill"
                  closable
                  @close="removeTag(skill)"
                  style="margin-right: 6px; margin-bottom: 6px"
                >
                  {{ skill }}
                </NTag>
              </div>
            </div>
          </form>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
          <button class="btn-primary-dialog" @click="handleSave">Save Changes</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
