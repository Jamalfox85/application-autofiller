<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { usStates } from '../../utils/locationLists.ts'
import type { PersonalInfo } from '../../types/index.ts'

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

const handleSave = () => {
  emit('save', editableProfile.value)
  handleClose()
}

const handleClose = () => {
  emit('close')
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
          <h2>Edit Social Profiles</h2>
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
              <h3>Social & Portfolio</h3>
              <div class="form-group">
                <label for="editLinkedin">LinkedIn URL</label>
                <input
                  type="url"
                  id="editLinkedin"
                  v-model="editableProfile.linkedin"
                  placeholder="https://linkedin.com/in/johndoe"
                />
              </div>

              <div class="form-group">
                <label for="editWebsite">Portfolio/Website</label>
                <input
                  type="url"
                  id="editWebsite"
                  v-model="editableProfile.website"
                  placeholder="https://johndoe.com"
                />
              </div>

              <div class="form-group">
                <label for="editGithub">GitHub URL</label>
                <input
                  type="url"
                  id="editGithub"
                  v-model="editableProfile.github"
                  placeholder="https://github.com/johndoe"
                />
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
