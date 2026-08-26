<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { usStates } from '../../utils/locationLists.ts'
import type { Education, PersonalInfo } from '../../types/index.ts'
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
const openIndex = ref(-1)
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | undefined

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

const toggleOpen = (index: number) => {
  openIndex.value = openIndex.value === index ? -1 : index
}

const toggleCurrent = (edu: Education) => {
  edu.current = !edu.current
  if (edu.current) edu.graduationYear = ''
  saved.value = false
}

const addEducation = async () => {
  if (editableProfile.value.education.length >= 5) {
    alert('You can add up to 5 education entries.')
    return
  }
  editableProfile.value.education.push({
    id: Date.now(),
    schoolName: '',
    degreeType: '',
    major: '',
    startYear: '',
    graduationYear: '',
    gpa: '',
    current: false,
    locationCity: '',
    locationState: '',
  })
  openIndex.value = editableProfile.value.education.length - 1
  saved.value = false

  await nextTick()
  const cards = document.querySelectorAll('.edu-card')
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const removeEducation = (index: number) => {
  editableProfile.value.education = editableProfile.value.education.filter((_, i) => i !== index)
  openIndex.value = -1
  saved.value = false
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
      openIndex.value = -1
      saved.value = false
    }
  },
)

onBeforeUnmount(() => clearTimeout(savedTimeout))
</script>
<template>
  <SectionSheet
    :show="show"
    title="Education"
    subtitle="Highest degree fills first"
    fullscreen
    @close="handleClose"
  >
    <div class="edu-list">
      <div v-if="editableProfile.education.length === 0" class="empty-education">
        <p>No education added yet. Click "+ Add a school" to get started.</p>
      </div>

      <div
        v-for="(edu, index) in editableProfile.education"
        :key="edu.id"
        class="edu-card"
        :class="{ open: openIndex === index }"
      >
        <button type="button" class="edu-card-head" @click="toggleOpen(index)">
          <span class="edu-caret" :class="{ open: openIndex === index }">▸</span>
          <span class="edu-card-title">
            <span class="edu-card-school">{{ edu.schoolName || 'Untitled school' }}</span>
            <span class="edu-card-degree">{{ edu.degreeType || 'Add a degree' }}</span>
          </span>
          <span class="edu-card-year">{{ edu.current ? 'Present' : edu.graduationYear || '—' }}</span>
        </button>

        <div v-if="openIndex === index" class="edu-card-body fs-form">
          <div class="form-group">
            <label :for="'schoolName' + index">School</label>
            <input
              type="text"
              :id="'schoolName' + index"
              v-model="edu.schoolName"
              placeholder="University of Example"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label :for="'degreeType' + index">Degree</label>
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
              <label :for="'major' + index">Field of study</label>
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
              <label :for="'locationCity' + index">City</label>
              <input
                type="text"
                :id="'locationCity' + index"
                v-model="edu.locationCity"
                placeholder="Davis"
              />
            </div>
            <div class="form-group">
              <label :for="'locationState' + index">State</label>
              <select :id="'locationState' + index" v-model="edu.locationState">
                <option :value="null">-- Select a state --</option>
                <option v-for="option in usStates" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label :for="'startYear' + index">Start</label>
              <input type="text" :id="'startYear' + index" v-model="edu.startYear" placeholder="2014" />
            </div>
            <div class="form-group">
              <label :for="'gradYear' + index">{{ edu.current ? 'Graduated — current' : 'Graduated' }}</label>
              <input
                type="text"
                :id="'gradYear' + index"
                v-model="edu.graduationYear"
                placeholder="2018"
                :disabled="edu.current"
              />
            </div>
          </div>

          <button type="button" class="current-check" @click="toggleCurrent(edu)">
            <span class="current-check-box" :class="{ checked: edu.current }">✓</span>
            <span>I'm still studying here</span>
          </button>

          <div class="form-group">
            <label :for="'gpa' + index">GPA <span class="fs-optional">— optional</span></label>
            <input type="text" :id="'gpa' + index" v-model="edu.gpa" placeholder="3.8" />
          </div>

          <button type="button" class="remove-entry-btn" @click="removeEducation(index)">
            Remove school
          </button>
        </div>
      </div>

      <button type="button" class="add-entry-btn" @click="addEducation">+ Add a school</button>

      <div class="edu-hint">GPA is only filled when a form asks for it and you've entered one.</div>
    </div>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button class="btn-primary-dialog" :class="{ 'save-btn-saved': saved }" @click="handleSave">
        {{ saved ? 'Saved' : 'Save changes' }}
      </button>
    </template>
  </SectionSheet>
</template>

<style scoped>
.edu-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.edu-card {
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 9px;
  overflow: hidden;
}

.edu-card.open {
  border-color: #3a2f5e;
  background: #181620;
}

.edu-card-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
  padding: 11px;
}

.edu-caret {
  font-size: 9px;
  color: #6f6f7a;
  transition: transform 120ms ease;
}

.edu-caret.open {
  color: #a78bfa;
  transform: rotate(90deg);
}

.edu-card-title {
  min-width: 0;
  display: block;
}

.edu-card-school {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edu-card-degree {
  display: block;
  font-size: 11px;
  color: #8f8f99;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edu-card-year {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #6f6f7a;
  text-align: right;
  white-space: nowrap;
}

.edu-card-body {
  padding: 12px 11px;
  border-top: 1px solid #22222a;
  margin-top: 2px;
  gap: 10px !important;
}

.current-check {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
  color: #ebebee;
  font-size: 12px;
}

.current-check-box {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  border: 1px solid #3d3d47;
  color: transparent;
}

.current-check-box.checked {
  background: #7c3aed;
  border: none;
  color: #fff;
}

.remove-entry-btn {
  align-self: flex-start;
  border: 1px solid #3a2626;
  background: none;
  color: #c07b7b;
  border-radius: 7px;
  padding: 6px 11px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.remove-entry-btn:hover {
  border-color: #5c3838;
  color: #e08a8a;
}

.add-entry-btn {
  flex: none;
  border: 1px dashed #33333d;
  background: none;
  color: #a78bfa;
  border-radius: 9px;
  padding: 10px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.add-entry-btn:hover {
  border-color: #4c3a86;
  background: rgba(124, 58, 237, 0.06);
}

.edu-hint {
  font-size: 11px;
  color: #6f6f7a;
  line-height: 1.5;
  padding: 4px 2px;
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
