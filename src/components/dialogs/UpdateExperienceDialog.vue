<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { usStates } from '../../utils/locationLists.ts'
import type { Experience, PersonalInfo } from '../../types/index.ts'
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

const toggleCurrent = (exp: Experience) => {
  exp.present = !exp.present
  if (exp.present) exp.endDate = ''
  saved.value = false
}

const addExperience = async () => {
  if (editableProfile.value.experience.length >= 5) {
    alert('You can add up to 5 experience entries.')
    return
  }
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
  openIndex.value = editableProfile.value.experience.length - 1
  saved.value = false

  await nextTick()
  const cards = document.querySelectorAll('.exp-card')
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const removeExperience = (index: number) => {
  editableProfile.value.experience = editableProfile.value.experience.filter((_, i) => i !== index)
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
    title="Work experience"
    subtitle="Most recent role fills first"
    fullscreen
    @close="handleClose"
  >
    <div class="exp-list">
      <div v-if="editableProfile.experience.length === 0" class="empty-education">
        <p>No experience added yet. Click "+ Add a role" to get started.</p>
      </div>

      <div
        v-for="(exp, index) in editableProfile.experience"
        :key="exp.id"
        class="exp-card"
        :class="{ open: openIndex === index }"
      >
        <button type="button" class="exp-card-head" @click="toggleOpen(index)">
          <span class="exp-caret" :class="{ open: openIndex === index }">▸</span>
          <span class="exp-card-title">
            <span class="exp-card-role">{{ exp.jobTitle || 'Untitled role' }}</span>
            <span class="exp-card-company">{{ exp.companyName || 'Add a company' }}</span>
          </span>
          <span class="exp-card-dates">
            {{ exp.startDate || '?' }} — {{ exp.present ? 'Present' : exp.endDate || '?' }}
          </span>
        </button>

        <div v-if="openIndex === index" class="exp-card-body fs-form">
          <div class="form-group">
            <label :for="'companyName' + index">Company</label>
            <input
              type="text"
              :id="'companyName' + index"
              v-model="exp.companyName"
              placeholder="Acme Corp"
            />
          </div>

          <div class="form-group">
            <label :for="'jobTitle' + index">Job title</label>
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
            <div class="form-group">
              <label :for="'locationState' + index">State</label>
              <select :id="'locationState' + index" v-model="exp.locationState">
                <option :value="null">-- Select a state --</option>
                <option v-for="option in usStates" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label :for="'startDate' + index">Start</label>
              <input type="month" :id="'startDate' + index" v-model="exp.startDate" />
            </div>
            <div class="form-group">
              <label :for="'endDate' + index">{{ exp.present ? 'End — current' : 'End' }}</label>
              <input
                type="month"
                :id="'endDate' + index"
                v-model="exp.endDate"
                :disabled="exp.present"
              />
            </div>
          </div>

          <button type="button" class="current-check" @click="toggleCurrent(exp)">
            <span class="current-check-box" :class="{ checked: exp.present }">✓</span>
            <span>I currently work here</span>
          </button>

          <div class="form-group">
            <label :for="'description' + index"
              >What you did <span class="fs-optional">— optional</span></label
            >
            <textarea
              :id="'description' + index"
              v-model="exp.description"
              placeholder="Used when a form asks for a description."
              rows="3"
            ></textarea>
          </div>

          <button type="button" class="remove-entry-btn" @click="removeExperience(index)">
            Remove role
          </button>
        </div>
      </div>

      <button type="button" class="add-entry-btn" @click="addExperience">+ Add a role</button>
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
.exp-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.exp-card {
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 9px;
  overflow: hidden;
}

.exp-card.open {
  border-color: #3a2f5e;
  background: #181620;
}

.exp-card-head {
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

.exp-caret {
  font-size: 9px;
  color: #6f6f7a;
  transition: transform 120ms ease;
}

.exp-caret.open {
  color: #a78bfa;
  transform: rotate(90deg);
}

.exp-card-title {
  min-width: 0;
  display: block;
}

.exp-card-role {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exp-card-company {
  display: block;
  font-size: 11px;
  color: #8f8f99;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exp-card-dates {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #6f6f7a;
  text-align: right;
  white-space: nowrap;
}

.exp-card-body {
  padding: 0 11px 12px;
  border-top: 1px solid #22222a;
  margin-top: 2px;
  padding-top: 12px;
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

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
