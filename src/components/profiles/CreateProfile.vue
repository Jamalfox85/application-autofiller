<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CreateProfileRequest, ProfileSummary } from '@/lib/sync/profiles'
import { isProfileNameTaken, nextDefaultProfileName, PROFILE_ERROR_COPY } from '@/lib/sync/profiles'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx']

const props = defineProps<{
  profiles: ProfileSummary[]
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [request: CreateProfileRequest]
  cancel: []
}>()

const name = ref(nextDefaultProfileName(props.profiles))
const start = ref<CreateProfileRequest['start']>('copy')
const copyFrom = ref<string | null>(props.profiles.find((p) => p.is_active)?.id ?? props.profiles[0]?.id ?? null)
const file = ref<File | null>(null)
const localError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const shownError = computed(() => localError.value || props.error)

const pickFile = () => fileInput.value?.click()

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] ?? null
  input.value = ''
  if (!picked) return
  const ext = picked.name.slice(picked.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    localError.value = 'Please upload a PDF or DOCX file.'
    return
  }
  if (picked.size > MAX_FILE_SIZE) {
    localError.value = 'That file is too large — please upload something under 10MB.'
    return
  }
  localError.value = ''
  file.value = picked
}

const submit = () => {
  localError.value = ''
  const clean = name.value.trim().replace(/\s+/g, ' ')
  if (!clean || clean.length > 60) {
    localError.value = PROFILE_ERROR_COPY.invalid_name
    return
  }
  if (isProfileNameTaken(props.profiles, clean)) {
    localError.value = PROFILE_ERROR_COPY.name_taken
    return
  }
  if (start.value === 'copy' && !copyFrom.value) {
    localError.value = 'Choose a profile to copy.'
    return
  }
  if (start.value === 'resume' && !file.value) {
    localError.value = 'Choose a resume to start from.'
    return
  }
  emit('submit', {
    name: clean,
    start: start.value,
    copyFrom: start.value === 'copy' ? copyFrom.value : null,
    file: start.value === 'resume' ? file.value : null,
  })
}
</script>

<template>
  <form class="fs-form create-profile" @submit.prevent="submit">
    <div class="fs-group">
      <div class="fs-group-header">
        <span class="fs-group-label">Name</span>
      </div>
      <div class="form-group">
        <input v-model="name" type="text" maxlength="60" placeholder="e.g. Contract roles" :disabled="busy" />
      </div>
    </div>

    <div class="fs-divider"></div>

    <div class="fs-group">
      <div class="fs-group-header">
        <span class="fs-group-label">Starting point</span>
      </div>

      <label class="start-card" :class="{ selected: start === 'copy' }">
        <input v-model="start" type="radio" value="copy" :disabled="busy" />
        <span class="start-body">
          <span class="start-title">Copy a profile</span>
          <span class="start-desc">Everything, including its resume and custom responses.</span>
          <select v-if="start === 'copy'" v-model="copyFrom" class="start-select" :disabled="busy">
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}{{ profile.is_active ? ' (active)' : '' }}
            </option>
          </select>
        </span>
      </label>

      <label class="start-card" :class="{ selected: start === 'resume' }">
        <input v-model="start" type="radio" value="resume" :disabled="busy" />
        <span class="start-body">
          <span class="start-title">Start from a resume</span>
          <span class="start-desc">We read it and show you everything to confirm.</span>
          <button v-if="start === 'resume'" type="button" class="start-file" :disabled="busy" @click.prevent="pickFile">
            {{ file ? file.name : 'Choose a PDF or DOCX' }}
          </button>
        </span>
      </label>
      <input ref="fileInput" type="file" accept=".pdf,.docx" class="visually-hidden" @change="onFileChange" />

      <label class="start-card" :class="{ selected: start === 'blank' }">
        <input v-model="start" type="radio" value="blank" :disabled="busy" />
        <span class="start-body">
          <span class="start-title">Start blank</span>
          <span class="start-desc">Fill the sections in yourself.</span>
        </span>
      </label>
    </div>

    <p v-if="shownError" class="fs-error">{{ shownError }}</p>

    <div class="create-actions">
      <button type="button" class="btn-secondary-dialog" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn-primary-dialog" :disabled="busy">
        {{ busy ? 'Creating…' : 'Create profile' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.create-profile .form-group input {
  width: 100%;
}

.start-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
  cursor: pointer;
}

.start-card.selected {
  border-color: #7c3aed;
  background: #1b1727;
}

.start-card input[type='radio'] {
  margin-top: 2px;
  accent-color: #7c3aed;
}

.start-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.start-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #ebebee;
}

.start-desc {
  font-size: 11px;
  color: #8f8f99;
  line-height: 1.4;
}

.start-select,
.start-file {
  margin-top: 6px;
  width: 100%;
  border: 1px solid #2e2e36;
  background: #0c0c0e;
  color: #ebebee;
  border-radius: 7px;
  padding: 7px 8px;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.start-file {
  cursor: pointer;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.create-actions {
  display: flex;
  gap: 8px;
}

.create-actions .btn-secondary-dialog {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 8px;
  padding: 9px 13px;
  font-size: 12.5px;
}

.create-actions .btn-primary-dialog {
  flex: 1;
  background: #7c3aed;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
}

.create-actions .btn-primary-dialog:hover {
  background: #8b5cf6;
  box-shadow: none;
}

.create-actions .btn-primary-dialog:disabled {
  background: #1a1a1f;
  color: #5c5c66;
  cursor: not-allowed;
}
</style>
