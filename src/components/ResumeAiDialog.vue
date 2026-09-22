<script setup lang="ts">
import { ref } from 'vue'
import { callProResume, summarizeProData } from '@/services/billing/proApi'

const emit = defineEmits<{
  close: []
  planRequired: []
}>()

const jobDescription = ref('')
const status = ref('')
const error = ref('')
const busy = ref(false)

async function run(action: 'generate' | 'analyze') {
  error.value = ''
  status.value = ''
  const job_description = jobDescription.value.trim()
  if (!job_description) {
    error.value = 'Paste a job description first.'
    return
  }
  busy.value = true
  try {
    const result = await callProResume(action, { job_description })
    if (!result.ok && 'gate' in result) {
      emit('planRequired')
      return
    }
    if (!result.ok) {
      error.value = result.message
      return
    }
    status.value = summarizeProData(result.data)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Request failed.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="paywall-overlay" @click.self="emit('close')">
    <div class="paywall-card" role="dialog" aria-modal="true">
      <button class="paywall-x" type="button" aria-label="Close" @click="emit('close')">×</button>
      <h2>Resume tailor + ATS score</h2>
      <p>Tailor uses resume generate. ATS score uses analyze. Both send your sign-in token.</p>
      <textarea
        v-model="jobDescription"
        rows="5"
        placeholder="Paste the job description"
      ></textarea>
      <button class="paywall-primary" type="button" :disabled="busy" @click="run('generate')">
        Tailor resume
      </button>
      <button class="paywall-secondary" type="button" :disabled="busy" @click="run('analyze')">
        ATS score
      </button>
      <p v-if="status">{{ status }}</p>
      <p v-if="error" class="paywall-error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.paywall-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.paywall-card {
  width: 100%;
  max-height: 100%;
  overflow: auto;
  background: #16161a;
  border: 1px solid #2e2e36;
  border-radius: 12px;
  padding: 16px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.paywall-x {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: none;
  color: #8f8f99;
  font-size: 16px;
  cursor: pointer;
}
h2 {
  margin: 0 18px 0 0;
  font-size: 15px;
  font-weight: 650;
}
p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: #b9b9c2;
}
textarea {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #2e2e36;
  background: #0c0c0e;
  color: #ebebee;
  font: 12.5px/1.4 inherit;
  padding: 8px;
  resize: vertical;
}
.paywall-primary,
.paywall-secondary {
  width: 100%;
  border-radius: 9px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 11px 12px;
  cursor: pointer;
}
.paywall-primary {
  border: none;
  background: #7c3aed;
  color: #fff;
}
.paywall-secondary {
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #ebebee;
}
.paywall-primary:disabled,
.paywall-secondary:disabled {
  opacity: 0.6;
  cursor: wait;
}
.paywall-error {
  color: #f0a8a8;
}
</style>
