<script setup lang="ts">
import { ref, watch, computed } from 'vue'
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

const addEducation = () => {
  editableProfile.value.education.push({
    id: Date.now(),
    schoolName: '',
    degreeType: '',
    major: '',
    startYear: '',
    graduationYear: '',
    gpa: '',
  })
}

const removeEducation = (index: number) => {
  editableProfile.value.education = editableProfile.value.education.filter((_, i) => i !== index)
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
          <h2>Edit Education</h2>
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
                <h3>Education</h3>
                <button type="button" class="btn-add-small" @click="addEducation">
                  + Add School
                </button>
              </div>

              <div v-if="editableProfile.education.length === 0" class="empty-education">
                <p>No education added yet. Click "+ Add School" to get started.</p>
              </div>

              <div
                v-for="(edu, index) in editableProfile.education"
                :key="edu.id"
                class="education-item"
              >
                <div class="education-header">
                  <span class="education-number">School {{ index + 1 }}</span>
                  <button type="button" class="btn-remove-small" @click="removeEducation(index)">
                    Remove
                  </button>
                </div>

                <div class="form-group">
                  <label :for="'schoolName' + index">School Name</label>
                  <input
                    type="text"
                    :id="'schoolName' + index"
                    v-model="edu.schoolName"
                    placeholder="University of Example"
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label :for="'degreeType' + index">Degree Type</label>
                    <select :id="'degreeType' + index" v-model="edu.degreeType">
                      <option value="">Select degree...</option>
                      <option value="high_school_diploma">High School Diploma</option>
                      <option value="associates">Associate's</option>
                      <option value="bachelors">Bachelor's</option>
                      <option value="masters">Master's</option>
                      <option value="phd">PhD</option>
                      <option value="certificate">Certificate</option>
                      <option value="bootcamp">Bootcamp</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label :for="'major' + index">Major/Field of Study</label>
                    <input
                      type="text"
                      :id="'major' + index"
                      v-model="edu.major"
                      placeholder="Computer Science"
                    />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label :for="'startYear' + index">Start Year</label>
                    <input
                      type="text"
                      :id="'startYear' + index"
                      v-model="edu.startYear"
                      placeholder="2022"
                    />
                  </div>
                  <div class="form-group">
                    <label :for="'gradYear' + index">Graduation Year</label>
                    <input
                      type="text"
                      :id="'gradYear' + index"
                      v-model="edu.graduationYear"
                      placeholder="2026"
                    />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label :for="'gpa' + index">GPA (optional)</label>
                    <input type="text" :id="'gpa' + index" v-model="edu.gpa" placeholder="3.8" />
                  </div>
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
