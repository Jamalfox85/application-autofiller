<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { mergeParsedResume } from '@/utils/resumeParsing'
import type { ParsedResumeData, PersonalInfo } from '../types'
import PickPath from './onboarding/PickPath.vue'
import ConfirmResume from './onboarding/ConfirmResume.vue'
import EnablePermissions from './onboarding/EnablePermissions.vue'
import ManualEntryChecklist from './onboarding/ManualEntryChecklist.vue'
import { useResumeUpload } from '@/composables/useResumeUpload'
import { captureEvent } from '@/services/posthog'
import { CORE_SECTIONS } from '@/utils/infocards.ts'
import { trackEvent } from '@/services/mixpanel'
import { completeProfileSetupSession, getProfileSetupSession } from '@/services/profileSetupSession'

const props = defineProps<{
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  save: [profile: PersonalInfo]
  finish: [profile?: PersonalInfo]
}>()

type Step = 'pick' | 'parsing' | 'confirm' | 'manual' | 'permissions'

const step = ref<Step>('pick')
const errorMessage = ref('')
const parsedData = ref<(ParsedResumeData & { fileName?: string }) | null>(null)

const resumeUpload = useResumeUpload()

// Hard stop on the parsing screen. The worker + storage-watch + poll should land the result
// well inside this, but if none of them do (e.g. the service worker was killed mid-request),
// the API has almost certainly still written the profile server-side — so just move on to the
// main view, which reloads the profile from Supabase.
const PARSING_FALLBACK_MS = 15_000
let parsingFallback: ReturnType<typeof setTimeout> | undefined

const clearParsingFallback = () => {
  clearTimeout(parsingFallback)
  parsingFallback = undefined
}

const armParsingFallback = () => {
  clearParsingFallback()
  parsingFallback = setTimeout(() => {
    if (step.value !== 'parsing') return
    resumeUpload.clear()
    emit('finish')
  }, PARSING_FALLBACK_MS)
}

const handleUpload = (file: File) => {
  errorMessage.value = ''
  resumeUpload.start(file)
}

const handleInvalidFile = (message: string) => {
  errorMessage.value = message
}

// The worker owns the request; react to its outcome. immediate so a popup reopened after the
// upload already finished still advances.
watch(
  () => resumeUpload.phase.value,
  (phase) => {
    if (phase === 'uploading') {
      errorMessage.value = ''
      step.value = 'parsing'
      armParsingFallback()
    } else if (phase === 'done') {
      clearParsingFallback()
      captureEvent('resume_upload_succeeded', {})
      if (resumeUpload.parsedResume.value) {
        parsedData.value = {
          ...resumeUpload.parsedResume.value,
          fileName: resumeUpload.fileName.value,
        }
        step.value = 'confirm'
      } else {
        // Repeat upload (parsed === null) — nothing new to review; carry on.
        step.value = 'permissions'
      }
      resumeUpload.clear()
    } else if (phase === 'error') {
      clearParsingFallback()
      captureEvent('resume_upload_failed', { message: resumeUpload.errorMessage.value })
      errorMessage.value = resumeUpload.errorMessage.value
      step.value = step.value === 'parsing' ? 'pick' : step.value
      resumeUpload.clear()
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearParsingFallback)

const handleConfirmContinue = () => {
  step.value = 'permissions'
}

const handleManualSave = (profile: PersonalInfo) => {
  emit('save', profile)
}

const handleFinish = async () => {
  const finalProfile = parsedData.value
    ? mergeParsedResume(parsedData.value, { fileName: parsedData.value.fileName })
    : props.personalInfo

  const session = await getProfileSetupSession()
  if (session) {
    trackEvent('profile_setup_completed', {
      required_fields_completed_count: CORE_SECTIONS.filter(
        (s) => s.required && s.done(finalProfile),
      ).length,
      time_to_complete_seconds: (Date.now() - session.startedAt) / 1000,
      // experience_level omitted — the profile form does not collect a stated level.
    })
    await completeProfileSetupSession()
  }

  if (parsedData.value) {
    emit('finish', finalProfile)
  } else {
    emit('finish')
  }
}
</script>

<template>
  <div class="onboarding-container">
    <PickPath
      v-if="step === 'pick'"
      @upload="handleUpload"
      @invalid="handleInvalidFile"
      @manual="step = 'manual'"
      @skip="$emit('finish')"
    />

    <div v-else-if="step === 'parsing'" class="parsing-state">
      <div class="spinner"></div>
      <p class="parsing-text">Reading your resume…</p>
      <p class="parsing-hint">Keep this window open — this usually takes around 15 seconds.</p>
    </div>

    <ConfirmResume
      v-else-if="step === 'confirm' && parsedData"
      :parsedData="parsedData"
      @back="step = 'pick'"
      @replace="step = 'pick'"
      @continue="handleConfirmContinue"
    />

    <ManualEntryChecklist
      v-else-if="step === 'manual'"
      :personalInfo="personalInfo"
      @save="handleManualSave"
      @finish-later="step = 'permissions'"
    />

    <EnablePermissions v-else-if="step === 'permissions'" @finish="handleFinish" />

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.onboarding-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #0c0c0e;
}

.parsing-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid #23272f;
  border-top-color: #7c3aed;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.parsing-text {
  font-size: 0.975rem;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.parsing-hint {
  font-size: 0.825rem;
  color: #6b7280;
  margin: 0;
}

.error-banner {
  position: absolute;
  bottom: 8px;
  left: 13px;
  right: 13px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  font-size: 11.5px;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: center;
}
</style>
