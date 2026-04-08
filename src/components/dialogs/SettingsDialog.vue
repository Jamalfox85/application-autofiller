<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Settings } from '../../types/index.ts'

const props = defineProps<{
  show: boolean
  settings: Settings
}>()

const emit = defineEmits<{
  close: []
  save: [settings: Settings]
}>()

const editableSettings = ref<Settings>({
  ...props.settings,
})

const handleSave = () => {
  emit('save', editableSettings.value)
  handleClose()
}

const handleClose = () => {
  emit('close')
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableSettings.value = {
        ...props.settings,
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
          <h2>Edit User Settings</h2>
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
              <h3>Settings</h3>

              <div class="form-group">
                <label for="autofill_enabled">Auto-fill Enabled</label>
                <input
                  type="number"
                  min="0"
                  id="autofill_enabled"
                  v-model="editableSettings.desiredSalary"
                  placeholder="80,000"
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
