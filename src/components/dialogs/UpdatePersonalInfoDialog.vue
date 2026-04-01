<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { usStates } from '../../utils/locationLists.ts'
import type { PersonalInfo } from '../../types'

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
          <h2>Edit Personal Info</h2>
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
            <!-- Basic Information -->
            <div class="form-section">
              <h3>Basic Information</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="editFirstName">First Name</label>
                  <input
                    type="text"
                    id="editFirstName"
                    v-model="editableProfile.firstName"
                    placeholder="John"
                  />
                </div>
                <div class="form-group">
                  <label for="editLastName">Last Name</label>
                  <input
                    type="text"
                    id="editLastName"
                    v-model="editableProfile.lastName"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div class="form-group">
                <label for="editEmail">Email</label>
                <input
                  type="email"
                  id="editEmail"
                  v-model="editableProfile.email"
                  placeholder="john@example.com"
                />
              </div>

              <div class="form-group">
                <label for="editPhone">Phone</label>
                <input
                  type="tel"
                  id="editPhone"
                  v-model="editableProfile.phone"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <!-- Address -->
            <div class="form-section">
              <h3>Address</h3>
              <div class="form-group">
                <label for="editAddress">Street Address</label>
                <input
                  type="text"
                  id="editAddress"
                  v-model="editableProfile.address"
                  placeholder="123 Main St"
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="editCity">City</label>
                  <input
                    type="text"
                    id="editCity"
                    v-model="editableProfile.city"
                    placeholder="New York"
                  />
                </div>
                <div class="form-group form-group-small">
                  <label for="editState">State</label>
                  <select
                    id="editState"
                    v-model="editableProfile.state"
                    :disabled="!editableProfile.country"
                  >
                    <option :value="null">-- Select a state --</option>
                    <option v-for="option in usStates" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
                <div class="form-group form-group-small">
                  <label for="editZip">ZIP</label>
                  <input
                    type="text"
                    id="editZip"
                    v-model="editableProfile.zip"
                    placeholder="10001"
                  />
                </div>
                <div class="form-group form-group-small">
                  <label for="editCountry">Country</label>
                  <select id="editCountry" v-model="editableProfile.country">
                    <option :value="null">-- Select a country --</option>
                    <option value="united_states">United States</option>
                  </select>
                </div>
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
