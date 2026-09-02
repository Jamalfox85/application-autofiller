<script setup lang="ts">
import { ref } from 'vue'
import { captureEvent } from '@/services/posthog'
import { trackEvent } from '@/services/mixpanel'
import { startProfileSetupSession } from '@/services/profileSetupSession'
import { CORE_SECTIONS } from '@/utils/infocards.ts'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx']

const emit = defineEmits<{
  // Hands the validated file up to Welcome.vue, which runs the upload via the service worker.
  upload: [file: File]
  invalid: [message: string]
  manual: []
  skip: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const triggerFilePicker = () => {
  fileInput.value?.click()
}

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    emit('invalid', 'Please upload a PDF or DOCX file.')
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    emit('invalid', 'That file is too large — please upload something under 10MB.')
    return
  }

  captureEvent('resume_upload_started', { fileType: extension })
  trackProfileSetupStarted('default')
  emit('upload', file)
}

const trackProfileSetupStarted = async (profileType: 'default' | 'custom') => {
  const session = await startProfileSetupSession()
  trackEvent('profile_setup_started', {
    entry_point: 'onboarding_page',
    session_id: session.id,
    profile_type: profileType,
    language: navigator.language,
  })
}

const handleManual = () => {
  trackProfileSetupStarted('custom')
  emit('manual')
}
</script>

<template>
  <div class="onboarding-screen">
    <div class="onboarding-header">
      <div class="header-left">
        <span class="header-title">Welcome</span>
      </div>
      <span class="step-label">Step 1 of 3</span>
    </div>

    <div class="intro-copy">
      <div class="intro-title">Set up your profile once.</div>
      <div class="intro-subtitle">
        Everything you enter stays on this device unless you turn on sync. You can edit any field
        later.
      </div>
    </div>

    <div class="path-options">
      <button class="path-card primary" @click="triggerFilePicker">
        <div class="path-card-row">
          <span class="path-card-title">Upload a resumé</span>
          <span class="path-badge">Fastest</span>
        </div>
        <span class="path-card-desc">
          We read your name, contact details, roles and education, then show you everything to
          confirm. About 30 seconds.
        </span>
        <span class="dropzone-hint">Drop a PDF or DOCX, or browse</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.docx"
        class="visually-hidden"
        @change="handleFileChange"
      />

      <div class="divider">
        <span class="divider-line"></span>
        <span class="divider-label">or</span>
        <span class="divider-line"></span>
      </div>

      <button class="path-card" @click="handleManual">
        <div class="path-card-row">
          <span class="path-card-title">Enter it manually</span>
          <span class="path-card-meta">{{ CORE_SECTIONS.length }} sections</span>
        </div>
        <span class="path-card-desc">
          Fill the sections one at a time. Start with personal details and add the rest whenever
          you like.
        </span>
      </button>
    </div>

    <div class="onboarding-footer">
      <span class="footer-note">Only used to fill in your profile</span>
      <button class="footer-link" @click="$emit('skip')">Skip for now</button>
    </div>
  </div>
</template>

<style scoped>
.onboarding-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.onboarding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.step-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.intro-copy {
  padding: 20px 16px 14px;
  flex-shrink: 0;
}

.intro-title {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.intro-subtitle {
  font-size: 12.5px;
  color: #8f8f99;
  margin-top: 7px;
  line-height: 1.5;
}

.path-options {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.path-card {
  text-align: left;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.path-card:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.path-card.primary {
  border: 1px solid #3a2f5e;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
  gap: 12px;
}

.path-card.primary:hover {
  border-color: #7c3aed;
}

.path-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.path-card-title {
  font-size: 13.5px;
  font-weight: 600;
}

.path-badge {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(124, 58, 237, 0.18);
  border: 1px solid #4c3a86;
  color: #c4b5fd;
  border-radius: 20px;
  padding: 2px 7px;
}

.path-card-meta {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.path-card-desc {
  font-size: 12px;
  color: #8f8f99;
  line-height: 1.5;
}

.dropzone-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #4c3a86;
  border-radius: 8px;
  padding: 16px 12px;
  font-size: 12px;
  color: #a78bfa;
  background: rgba(124, 58, 237, 0.06);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: #22222a;
}

.divider-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #5c5c66;
}

.onboarding-footer {
  border-top: 1px solid #22222a;
  padding: 10px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.footer-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.footer-link {
  background: none;
  border: none;
  color: #a78bfa;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.footer-link:hover {
  color: #c4b5fd;
}
</style>
