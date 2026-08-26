<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { usStates, canadaProvinces, ukRegions } from '../../utils/locationLists.ts'
import type { PersonalInfo } from '../../types'
import FullScreenSheet from './FullScreenSheet.vue'

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

const dirty = ref(false)
const saved = ref(false)
let savedTimeout: ReturnType<typeof setTimeout> | undefined

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailInvalid = computed(
  () => editableProfile.value.email.length > 0 && !emailPattern.test(editableProfile.value.email),
)

const statusText = computed(() => {
  if (saved.value) return 'Saved'
  if (dirty.value) return 'Unsaved changes'
  return 'Used on nearly every application'
})

const handleClose = () => {
  emit('close')
}

const handleSave = () => {
  if (emailInvalid.value) return
  emit('save', editableProfile.value)
  dirty.value = false
  saved.value = true
  clearTimeout(savedTimeout)
  savedTimeout = setTimeout(() => {
    saved.value = false
  }, 2200)
}

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length < 4) return digits.length ? `(${digits}` : ''
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const handlePhoneInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  editableProfile.value.phone = formatPhoneNumber(input.value)
}

const STATE_OPTIONS_BY_COUNTRY: Record<string, { label: string; value: string }[]> = {
  united_states: usStates,
  canada: canadaProvinces,
  united_kingdom: ukRegions,
}

const STATE_FIELD_LABEL_BY_COUNTRY: Record<string, string> = {
  united_states: 'State',
  canada: 'Province',
  united_kingdom: 'Region',
}

const stateOptions = computed(() => STATE_OPTIONS_BY_COUNTRY[editableProfile.value.country ?? ''] ?? [])
const stateFieldLabel = computed(
  () => STATE_FIELD_LABEL_BY_COUNTRY[editableProfile.value.country ?? ''] ?? 'State',
)

const handleCountryChange = (event: Event) => {
  editableProfile.value.country = (event.target as HTMLSelectElement).value
  editableProfile.value.state = null
}

// Keyed separately from the dial code itself (rather than binding the select straight to
// editableProfile.phoneCountryCode) so US and Canada can be distinct options with distinct
// flags despite sharing "+1" — a native <select> can't tell two options with the same value
// apart once one is selected, it just shows whichever comes first.
const phoneCountryOptions = [
  { key: 'us', flag: '🇺🇸', code: '+1' },
  { key: 'ca', flag: '🇨🇦', code: '+1' },
  { key: 'uk', flag: '🇬🇧', code: '+44' },
]

const selectedPhoneCountryKey = computed({
  get: () =>
    phoneCountryOptions.find((option) => option.code === editableProfile.value.phoneCountryCode)
      ?.key ?? 'us',
  set: (key: string) => {
    editableProfile.value.phoneCountryCode =
      phoneCountryOptions.find((option) => option.key === key)?.code ?? ''
  },
})

watch(
  () => props.show,
  async (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
      // Let the deep watcher below settle from this reassignment before clearing dirty,
      // otherwise loading the panel would immediately read as "Unsaved changes".
      await nextTick()
      dirty.value = false
      saved.value = false
    }
  },
)

watch(
  editableProfile,
  () => {
    dirty.value = true
    saved.value = false
  },
  { deep: true },
)

onBeforeUnmount(() => clearTimeout(savedTimeout))
</script>
<template>
  <FullScreenSheet :show="show" title="Personal details" @close="handleClose">
    <template #status>{{ statusText }}</template>

    <form @submit.prevent="handleSave" class="edit-profile-form fs-form">
      <div class="fs-group">
        <span class="fs-group-label">Name</span>
        <div class="form-row">
          <div class="form-group">
            <label for="editFirstName">First</label>
            <input
              type="text"
              id="editFirstName"
              v-model="editableProfile.firstName"
              placeholder="John"
            />
          </div>
          <div class="form-group">
            <label for="editLastName">Last</label>
            <input
              type="text"
              id="editLastName"
              v-model="editableProfile.lastName"
              placeholder="Doe"
            />
          </div>
        </div>
        <div class="form-group">
          <label for="editMiddleName">Middle name <span class="fs-optional">— optional</span></label>
          <input
            type="text"
            id="editMiddleName"
            v-model="editableProfile.middleName"
            placeholder="Used when a form asks separately"
          />
        </div>
      </div>

      <div class="fs-divider"></div>

      <div class="fs-group">
        <span class="fs-group-label">Contact</span>
        <div class="form-group">
          <label for="editEmail">Email</label>
          <input
            type="email"
            id="editEmail"
            v-model="editableProfile.email"
            :class="{ 'fs-input-invalid': emailInvalid }"
            placeholder="john@example.com"
          />
          <span v-if="emailInvalid" class="fs-error">Enter a valid email address</span>
        </div>

        <div class="form-row phone-row">
          <div class="form-group form-group-small phone-code-group">
            <select id="editPhoneCountryCode" aria-label="Country code" v-model="selectedPhoneCountryKey">
              <option
                v-for="option in phoneCountryOptions"
                :key="option.key"
                :value="option.key"
              >
                {{ option.flag }} {{ option.code }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="editPhone">Phone</label>
            <input
              type="tel"
              id="editPhone"
              :value="editableProfile.phone"
              @input="handlePhoneInput"
              placeholder="(555) 123-4567"
              maxlength="14"
            />
          </div>
        </div>
      </div>

      <div class="fs-divider"></div>

      <div class="fs-group">
        <div class="fs-group-header">
          <span class="fs-group-label">Address</span>
          <span class="fs-group-hint">Some forms need the full one</span>
        </div>

        <div class="form-group">
          <label for="editAddress">Street</label>
          <input
            type="text"
            id="editAddress"
            v-model="editableProfile.address"
            placeholder="123 Main St"
          />
        </div>

        <div class="form-group">
          <label for="editAddress2">Apt, suite <span class="fs-optional">— optional</span></label>
          <input
            type="text"
            id="editAddress2"
            v-model="editableProfile.addressLine2"
            placeholder="Unit 4"
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="editCountry">Country</label>
            <select id="editCountry" :value="editableProfile.country" @change="handleCountryChange">
              <option value="">-- Select a country --</option>
              <option value="united_states">United States</option>
              <option value="canada">Canada</option>
              <option value="united_kingdom">United Kingdom</option>
            </select>
          </div>
          <div class="form-group">
            <label for="editState">{{ stateFieldLabel }}</label>
            <select
              id="editState"
              v-model="editableProfile.state"
              :disabled="!editableProfile.country"
            >
              <option :value="null">-- Select a {{ stateFieldLabel.toLowerCase() }} --</option>
              <option v-for="option in stateOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
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
          <div class="form-group">
            <label for="editZip">ZIP</label>
            <input
              type="text"
              id="editZip"
              v-model="editableProfile.zip"
              placeholder="10001"
            />
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button
        class="btn-primary-dialog"
        :class="{ 'save-btn-saved': saved }"
        :disabled="emailInvalid"
        @click="handleSave"
      >
        {{ saved ? 'Saved' : 'Save details' }}
      </button>
    </template>
  </FullScreenSheet>
</template>

<style scoped>
.phone-row {
  grid-template-columns: 84px 1fr;
}

.phone-code-group {
  align-self: end;
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
