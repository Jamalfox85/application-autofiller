<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ApplicationAccount } from '../../types'
import FullScreenSheet from './FullScreenSheet.vue'

const props = defineProps<{
  show: boolean
  item: ApplicationAccount | null
}>()

const emit = defineEmits<{
  close: []
  add: [account: ApplicationAccount]
  save: [account: ApplicationAccount]
  delete: [id: number]
}>()

const PORTAL_OPTIONS = ['Workday', 'Greenhouse', 'iCIMS', 'Taleo', 'Other']

const portal = ref(PORTAL_OPTIONS[0])
const email = ref('')
const password = ref('')
const requireConfirmation = ref(true)
const showPassword = ref(false)
const saved = ref(false)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailInvalid = computed(() => email.value.length > 0 && !emailPattern.test(email.value))
const isReady = computed(() => !emailInvalid.value && email.value.trim().length > 0 && password.value.length > 0)

const passwordScore = computed(() => {
  const pw = password.value
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 14) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (/[0-9]/.test(pw) && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  return Math.min(4, score)
})

const passwordLabel = computed(() => {
  if (password.value.length === 0) return ''
  if (passwordScore.value >= 3) return 'Strong'
  if (passwordScore.value === 2) return 'Fair'
  return 'Weak'
})

const passwordLabelClass = computed(() => {
  if (passwordScore.value >= 3) return 'pw-strong'
  if (passwordScore.value === 2) return 'pw-fair'
  return 'pw-weak'
})

const resetForm = () => {
  if (props.item) {
    portal.value = props.item.portal
    email.value = props.item.email
    password.value = props.item.password
    requireConfirmation.value = props.item.requireConfirmation
  } else {
    portal.value = PORTAL_OPTIONS[0]
    email.value = ''
    password.value = ''
    requireConfirmation.value = true
  }
  showPassword.value = false
  saved.value = false
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) resetForm()
  },
)

const handleClose = () => {
  emit('close')
}

const handleSave = () => {
  if (!isReady.value) return
  const account: ApplicationAccount = {
    id: props.item?.id ?? Date.now(),
    portal: portal.value,
    email: email.value.trim(),
    password: password.value,
    requireConfirmation: requireConfirmation.value,
  }
  if (props.item) {
    emit('save', account)
  } else {
    emit('add', account)
  }
  saved.value = true
}
</script>

<template>
  <FullScreenSheet :show="show" :title="item ? 'Edit account' : 'Add account'" @close="handleClose">
    <template #status>Encrypted</template>

    <div class="fs-form account-form">
      <div class="form-group">
        <label>Portal</label>
        <div class="portal-options">
          <button
            v-for="option in PORTAL_OPTIONS"
            :key="option"
            type="button"
            class="portal-pill"
            :class="{ active: portal === option }"
            @click="portal = option"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <label class="form-group">
        <span>Email</span>
        <input
          v-model="email"
          type="text"
          :class="{ 'fs-input-invalid': emailInvalid }"
          placeholder="Email you use to sign in"
        />
        <span v-if="emailInvalid" class="fs-error">Enter a valid email address</span>
      </label>

      <label class="form-group">
        <span>Password</span>
        <div class="password-row">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="••••••••••••"
          />
          <button type="button" class="password-toggle" @click="showPassword = !showPassword">
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
        <div v-if="password.length > 0" class="password-strength">
          <span class="password-strength-track">
            <span
              class="password-strength-bar"
              :class="passwordLabelClass"
              :style="{ width: passwordScore * 25 + '%' }"
            ></span>
          </span>
          <span class="password-strength-label" :class="passwordLabelClass">{{ passwordLabel }}</span>
        </div>
      </label>

      <div class="confirm-row">
        <div class="confirm-copy">
          <div class="confirm-title">Require confirmation before filling</div>
          <div class="confirm-hint">Ask before entering this password</div>
        </div>
        <button
          class="toggle-track"
          :class="{ active: requireConfirmation }"
          role="switch"
          :aria-checked="requireConfirmation"
          type="button"
          @click="requireConfirmation = !requireConfirmation"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>

    <template #footer>
      <button
        v-if="item"
        type="button"
        class="account-delete-link"
        @click="emit('delete', item.id)"
      >
        Delete
      </button>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button
        class="btn-primary-dialog"
        :class="{ 'save-btn-saved': saved }"
        :disabled="!isReady"
        @click="handleSave"
      >
        {{ saved ? 'Saved' : item ? 'Save changes' : 'Save account' }}
      </button>
    </template>
  </FullScreenSheet>
</template>

<style scoped>
.account-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.account-form .form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-form .form-group > label:first-child,
.account-form .form-group > span:first-child {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c7c86;
}

.portal-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.portal-pill {
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 20px;
  padding: 5px 11px;
  white-space: nowrap;
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #8f8f99;
}

.portal-pill.active {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.14);
  color: #c4b5fd;
}

.password-row {
  display: flex;
  gap: 7px;
}

.password-row input {
  flex: 1;
  min-width: 0;
}

.password-toggle {
  flex: none;
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 7px;
  padding: 0 11px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  cursor: pointer;
}

.password-toggle:hover {
  color: #ebebee;
  border-color: #47475a;
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 2px;
}

.password-strength-track {
  flex: 1;
  height: 3px;
  border-radius: 3px;
  background: #1e1e24;
  overflow: hidden;
  display: block;
}

.password-strength-bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 140ms ease;
}

.password-strength-bar.pw-weak {
  background: #a35555;
}

.password-strength-bar.pw-fair {
  background: #e8b062;
}

.password-strength-bar.pw-strong {
  background: #4ea172;
}

.password-strength-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  flex: none;
}

.password-strength-label.pw-weak {
  color: #c07b7b;
}

.password-strength-label.pw-fair {
  color: #e8b062;
}

.password-strength-label.pw-strong {
  color: #7fbd9b;
}

.confirm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
}

.confirm-copy {
  min-width: 0;
}

.confirm-title {
  font-size: 12px;
  font-weight: 500;
  color: #ebebee;
}

.confirm-hint {
  font-size: 10.5px;
  color: #7c7c86;
  margin-top: 2px;
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

.account-delete-link {
  margin-right: auto;
  border: none;
  background: none;
  color: #a15c5c;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  padding: 9px 4px;
}

.account-delete-link:hover {
  color: #e08a8a;
}
</style>
