<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
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

const DEMO_QUESTIONS: {
  key: keyof PersonalInfo
  label: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: 'gender',
    label: 'Gender',
    options: [
      { value: '', label: 'Prefer not to say' },
      { value: 'male', label: 'Man' },
      { value: 'female', label: 'Woman' },
      { value: 'non_binary', label: 'Non-binary' },
      { value: 'self_describe', label: 'Self-describe' },
    ],
  },
  {
    key: 'raceEthnicity',
    label: 'Race / ethnicity',
    options: [
      { value: '', label: 'Prefer not to say' },
      { value: 'american_indian_or_alaska_native', label: 'American Indian or Alaska Native' },
      { value: 'asian', label: 'Asian' },
      { value: 'black_or_african_american', label: 'Black or African American' },
      { value: 'hispanic_or_latino', label: 'Hispanic or Latino' },
      {
        value: 'native_hawaiian_or_other_pacific_islander',
        label: 'Native Hawaiian or Pacific Islander',
      },
      { value: 'white', label: 'White' },
      { value: 'two_or_more_races', label: 'Two or more races' },
    ],
  },
  {
    key: 'disabilityStatus',
    label: 'Disability status',
    options: [
      { value: '', label: 'Prefer not to say' },
      { value: 'yes', label: 'Yes, I have a disability' },
      { value: 'no', label: 'No, I do not have a disability' },
      { value: 'previously', label: 'I had a disability previously' },
    ],
  },
  {
    key: 'veteranStatus',
    label: 'Veteran status',
    options: [
      { value: '', label: 'Prefer not to say' },
      { value: 'not_a_veteran', label: 'I am not a protected veteran' },
      { value: 'veteran', label: 'I identify as one or more protected veteran classifications' },
    ],
  },
  {
    key: 'age18OrOlder',
    label: '18 years or older',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: '', label: 'Prefer not to say' },
    ],
  },
]

const editableProfile = ref<PersonalInfo>({
  ...props.personalInfo,
})
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | undefined

const eeoOn = computed(() => editableProfile.value.eeoAnswersEnabled !== false)
const eeoHint = computed(() =>
  eeoOn.value ? 'Filled when a form includes them' : 'GoFillr will skip these questions',
)

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

const toggleEeo = () => {
  editableProfile.value.eeoAnswersEnabled = !eeoOn.value
  saved.value = false
}

const setAnswer = (key: keyof PersonalInfo, value: string) => {
  ;(editableProfile.value as Record<string, unknown>)[key] = value
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
    title="Demographics"
    subtitle="Answered only when a form asks"
    fullscreen
    @close="handleClose"
  >
    <div class="demo-toggle-row">
      <div class="demo-toggle-copy">
        <div class="demo-toggle-title">Answer these at all</div>
        <div class="demo-toggle-hint">{{ eeoHint }}</div>
      </div>
      <button
        class="toggle-track"
        :class="{ active: eeoOn }"
        role="switch"
        :aria-checked="eeoOn"
        type="button"
        @click="toggleEeo"
      >
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="demo-body" :class="{ off: !eeoOn }">
      <div class="demo-explainer">
        Used for Equal Employment Opportunity reporting. Every question can be left as prefer not
        to say, and GoFillr fills that answer when a form requires a choice.
      </div>

      <label v-for="q in DEMO_QUESTIONS" :key="q.key" class="form-group demo-field">
        <span>{{ q.label }}</span>
        <span class="demo-select-wrap">
          <select
            :value="editableProfile[q.key]"
            @change="setAnswer(q.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in q.options" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <span class="demo-select-arrow">▼</span>
        </span>
      </label>

      <div class="demo-notice">
        <span class="demo-notice-dot"></span>
        <span>Stored on your device. It is never used to decide which fields GoFillr fills.</span>
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
.demo-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
  margin-bottom: 13px;
}

.demo-toggle-copy {
  min-width: 0;
}

.demo-toggle-title {
  font-size: 12px;
  font-weight: 500;
  color: #ebebee;
}

.demo-toggle-hint {
  font-size: 10.5px;
  color: #7c7c86;
  margin-top: 2px;
  line-height: 1.45;
}

.demo-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: opacity 140ms ease;
}

.demo-body.off {
  opacity: 0.4;
  pointer-events: none;
}

.demo-explainer {
  font-size: 11px;
  color: #7c7c86;
  line-height: 1.55;
}

.demo-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.demo-field > span:first-child {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c7c86;
}

.demo-select-wrap {
  position: relative;
  display: block;
}

.demo-select-wrap select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid #2b2b33;
  background: #101014;
  color: #ebebee;
  border-radius: 7px;
  padding: 9px 28px 9px 10px;
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  cursor: pointer;
}

.demo-select-wrap select:focus {
  border-color: #7c3aed;
}

.demo-select-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  color: #6f6f7a;
  pointer-events: none;
}

.demo-notice {
  display: flex;
  gap: 9px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
}

.demo-notice-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #3a2f5e;
  background: rgba(124, 58, 237, 0.18);
  flex-shrink: 0;
  margin-top: 1px;
}

.demo-notice span:last-child {
  font-size: 11px;
  color: #8f8f99;
  line-height: 1.5;
}

.toggle-track {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 20px;
  border: 1px solid #33333d;
  background: #1e1e24;
  cursor: pointer;
  padding: 0;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.toggle-track.active {
  border-color: #7c3aed;
  background: #7c3aed;
}

.toggle-track:hover {
  border-color: #47475a;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: left 140ms ease;
}

.toggle-track.active .toggle-knob {
  left: 18px;
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
