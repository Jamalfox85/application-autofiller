<script setup lang="ts">
import { ref, watch } from 'vue'
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
          <h2>Edit Other Information</h2>
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
              <h3>Other Information</h3>

              <div class="form-group">
                <label for="editDesiredSalary">Desired Salary</label>
                <input
                  type="number"
                  min="0"
                  id="editDesiredSalary"
                  v-model="editableProfile.desiredSalary"
                  placeholder="80,000"
                />
              </div>

              <div class="form-group">
                <label for="editWorkAuthorization">Work Authorization</label>
                <select id="editWorkAuthorization" v-model="editableProfile.workAuthorization">
                  <option value="">Select...</option>
                  <option value="us_citizen">U.S. Citizen</option>
                  <option value="green_card">Green Card Holder (Permanent Resident)</option>
                  <option value="work_visa">Work Visa (H1B, etc.)</option>
                  <option value="need_sponsorsip">Will require sponsorship</option>
                </select>
              </div>
            </div>

            <div class="form-section">
              <h3>Application Account Password (common on Workday)</h3>

              <div class="form-group">
                <label for="accountPassword">Password</label>
                <input
                  type="password"
                  id="accountPassword"
                  v-model="editableProfile.accountPassword"
                  placeholder="Enter your application account password"
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
