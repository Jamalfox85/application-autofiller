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

const addExperience = () => {
  editableProfile.value.experience.push({
    id: Date.now(),
    companyName: '',
    jobTitle: '',
    locationCity: '',
    locationState: '',
    startDate: '',
    endDate: '',
    present: false,
    description: '',
  })
}

const removeExperience = (index: number) => {
  editableProfile.value.experience = editableProfile.value.experience.filter((_, i) => i !== index)
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
          <h2>Edit Experience</h2>
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
                <h3>Experience</h3>
                <button type="button" class="btn-add-small" @click="addExperience">
                  + Add Experience
                </button>
              </div>

              <div v-if="editableProfile.experience.length === 0" class="empty-education">
                <p>No experience added yet. Click "+ Add Experience" to get started.</p>
              </div>

              <div
                v-for="(exp, index) in editableProfile.experience"
                :key="exp.id"
                class="education-item"
              >
                <div class="education-header">
                  <span class="education-number">Experience {{ index + 1 }}</span>
                  <button type="button" class="btn-remove-small" @click="removeExperience(index)">
                    Remove
                  </button>
                </div>

                <div class="form-group">
                  <label :for="'companyName' + index">Company Name</label>
                  <input
                    type="text"
                    :id="'companyName' + index"
                    v-model="exp.companyName"
                    placeholder="Acme Corp"
                  />
                </div>

                <div class="form-group">
                  <label :for="'jobTitle' + index">Job Title</label>
                  <input
                    type="text"
                    :id="'jobTitle' + index"
                    v-model="exp.jobTitle"
                    placeholder="Software Engineer"
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label :for="'locationCity' + index">City</label>
                    <input
                      type="text"
                      :id="'locationCity' + index"
                      v-model="exp.locationCity"
                      placeholder="San Francisco"
                    />
                  </div>
                  <div class="form-group form-group-small">
                    <label :for="'locationState' + index">State</label>
                    <select id="editState" v-model="exp.locationState">
                      <option :value="null">-- Select a state --</option>
                      <option v-for="option in usStates" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label :for="'startDate' + index">Start Date</label>
                    <input
                      type="month"
                      :id="'startDate' + index"
                      v-model="exp.startDate"
                      placeholder="2020-01"
                    />
                  </div>

                  <div class="form-group">
                    <label :for="'endDate' + index">End Date</label>
                    <input
                      type="month"
                      :id="'endDate' + index"
                      v-model="exp.endDate"
                      placeholder="2023-12"
                      :disabled="exp.present"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      v-model="exp.present"
                      @change="exp.present ? (exp.endDate = '') : null"
                    />
                    <span>I currently work here</span>
                  </label>
                </div>

                <div class="form-group">
                  <label :for="'description' + index">Description</label>
                  <textarea
                    :id="'description' + index"
                    v-model="exp.description"
                    placeholder="Describe your responsibilities and achievements..."
                    rows="4"
                  ></textarea>
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
