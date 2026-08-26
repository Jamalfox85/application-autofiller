<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
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

// sponsor is what auto-fills sponsorshipRequired when a status is picked — kept separate from
// it so picking "Authorized, sponsorship needed later" doesn't silently overwrite an answer the
// user already corrected by hand.
const WORK_AUTH_STATUSES = [
  { value: 'us_citizen', label: 'U.S. citizen', sponsor: 'No' },
  { value: 'green_card', label: 'Permanent resident', sponsor: 'No' },
  { value: 'authorized_no_sponsorship', label: 'Authorized, no sponsorship needed', sponsor: 'No' },
  { value: 'work_visa', label: 'Authorized, sponsorship needed later', sponsor: 'Yes' },
  { value: 'need_sponsorship', label: 'Need sponsorship now', sponsor: 'Yes' },
]
const NOTICE_OPTIONS = ['Immediately', '2 weeks', '1 month', '2 months']

const editableProfile = ref<PersonalInfo>({
  ...props.personalInfo,
})
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

const pickStatus = (status: (typeof WORK_AUTH_STATUSES)[number]) => {
  editableProfile.value.workAuthorization = status.value
  editableProfile.value.sponsorshipRequired = status.sponsor
  saved.value = false
}

const pickSponsor = (value: string) => {
  editableProfile.value.sponsorshipRequired = value
  saved.value = false
}

const pickNotice = (value: string) => {
  editableProfile.value.noticePeriod = value
  saved.value = false
}

const handleSalaryInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  editableProfile.value.desiredSalary = input.value.replace(/[^0-9,]/g, '')
  editableProfile.value.salaryNegotiable = false
  saved.value = false
}

const toggleNegotiable = () => {
  editableProfile.value.salaryNegotiable = !editableProfile.value.salaryNegotiable
  saved.value = false
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
      saved.value = false
    }
  },
)

onBeforeUnmount(() => clearTimeout(savedTimeout))
</script>
<template>
  <SectionSheet
    :show="show"
    title="Work authorization"
    subtitle="Sponsorship and eligibility answers"
    fullscreen
    @close="handleClose"
  >
    <div class="auth-form">
      <div class="auth-group">
        <span class="fs-group-label">Status</span>
        <div class="auth-status-list">
          <button
            v-for="status in WORK_AUTH_STATUSES"
            :key="status.value"
            type="button"
            class="auth-status-row"
            :class="{ active: editableProfile.workAuthorization === status.value }"
            @click="pickStatus(status)"
          >
            <span
              class="auth-status-dot"
              :class="{ active: editableProfile.workAuthorization === status.value }"
            ></span>
            <span>{{ status.label }}</span>
          </button>
        </div>
      </div>

      <div class="fs-divider"></div>

      <div class="auth-group">
        <div class="fs-group-header">
          <span class="fs-group-label">Need sponsorship?</span>
          <span class="fs-group-hint">{{
            editableProfile.sponsorshipRequired === 'Yes' ? 'Asked on most US forms' : 'Set from your status'
          }}</span>
        </div>
        <div class="auth-chip-row">
          <button
            v-for="option in ['Yes', 'No']"
            :key="option"
            type="button"
            class="auth-chip auth-chip-wide"
            :class="{ active: editableProfile.sponsorshipRequired === option }"
            @click="pickSponsor(option)"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <div class="auth-group">
        <span class="fs-group-label">Notice period</span>
        <div class="auth-chip-row wrap">
          <button
            v-for="option in NOTICE_OPTIONS"
            :key="option"
            type="button"
            class="auth-chip"
            :class="{ active: editableProfile.noticePeriod === option }"
            @click="pickNotice(option)"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <div class="auth-group">
        <div class="fs-group-header">
          <span class="fs-group-label">Desired salary</span>
          <span class="fs-group-hint">Yearly, USD</span>
        </div>
        <div class="auth-salary-field">
          <span class="auth-salary-prefix">$</span>
          <input
            type="text"
            :value="editableProfile.salaryNegotiable ? '' : editableProfile.desiredSalary"
            :disabled="editableProfile.salaryNegotiable"
            placeholder="130,000"
            @input="handleSalaryInput"
          />
        </div>
        <button type="button" class="current-check" @click="toggleNegotiable">
          <span class="current-check-box" :class="{ checked: editableProfile.salaryNegotiable }">✓</span>
          <span>Fill "Negotiable" instead of a number</span>
        </button>
      </div>

      <div class="auth-notice">
        <span class="auth-notice-dot"></span>
        <span>These answers are filled only when a form asks. Nothing here is shared with a company otherwise.</span>
      </div>
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
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.auth-status-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.auth-status-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  color: #ebebee;
  border-radius: 8px;
  padding: 9px 11px;
  border: 1px solid #22222a;
  background: #17171b;
}

.auth-status-row.active {
  border-color: #3a2f5e;
  background: rgba(124, 58, 237, 0.12);
}

.auth-status-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid #3d3d47;
}

.auth-status-dot.active {
  border: 1px solid #7c3aed;
  background: #7c3aed;
  box-shadow: inset 0 0 0 2.5px #17171b;
}

.auth-chip-row {
  display: flex;
  gap: 6px;
}

.auth-chip-row.wrap {
  flex-wrap: wrap;
}

.auth-chip {
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  border-radius: 20px;
  padding: 5px 11px;
  white-space: nowrap;
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #8f8f99;
}

.auth-chip-wide {
  flex: 1;
  font-size: 12.5px;
  border-radius: 8px;
  padding: 9px;
  text-align: center;
}

.auth-chip.active {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
}

.auth-salary-field {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #2b2b33;
  background: #101014;
  border-radius: 7px;
  padding: 9px 10px;
}

.auth-salary-prefix {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: #5c5c66;
  flex-shrink: 0;
}

.auth-salary-field input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  color: #ebebee;
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  padding: 0;
}

.auth-salary-field input:disabled {
  color: #5c5c66;
}

.current-check {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  padding: 2px 0 0;
  color: #ebebee;
  font-size: 11.5px;
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

.auth-notice {
  display: flex;
  gap: 9px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
}

.auth-notice-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #3a2f5e;
  background: rgba(124, 58, 237, 0.18);
  flex-shrink: 0;
  margin-top: 1px;
}

.auth-notice span:last-child {
  font-size: 11px;
  color: #8f8f99;
  line-height: 1.5;
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
