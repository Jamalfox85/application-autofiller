<script setup lang="ts">
import { ref } from 'vue'
import { mergeParsedResume } from '@/utils/resumeParsing'
import type { ParsedResumeData, PersonalInfo } from '../types'
import PickPath from './onboarding/PickPath.vue'
import ConfirmResume from './onboarding/ConfirmResume.vue'
import EnablePermissions from './onboarding/EnablePermissions.vue'
import ManualEntryChecklist from './onboarding/ManualEntryChecklist.vue'
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

const handleParsing = () => {
  errorMessage.value = ''
  step.value = 'parsing'
}

const handleParsed = (data: ParsedResumeData & { fileName?: string }) => {
  parsedData.value = data
  step.value = 'confirm'
}

const handleParseFailed = (message: string) => {
  errorMessage.value = message
  step.value = 'pick'
}

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
      @parsing="handleParsing"
      @parsed="handleParsed"
      @parse-failed="handleParseFailed"
      @manual="step = 'manual'"
      @skip="$emit('finish')"
    />

    <div v-else-if="step === 'parsing'" class="parsing-state">
      <div class="spinner"></div>
      <p class="parsing-text">Reading your resume…</p>
      <p class="parsing-hint">Keep this window open — this takes about 10 seconds.</p>
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
