<script setup lang="ts">
import { ref, watch } from 'vue'
import { useResumeUpload } from '@/composables/useResumeUpload'

const ACCEPTED = ['.pdf', '.docx']
const MAX_FILE_SIZE = 10 * 1024 * 1024

const resumeUpload = useResumeUpload()
const input = ref<HTMLInputElement | null>(null)
const error = ref('')
const finished = ref(false)

// A tab keeps the file dialog from destroying the page, so the chosen file survives. The
// service worker owns the request; this page only starts it and reports the outcome. It does
// not clear the job: the popup applies the saved result the next time it opens.
watch(
  () => resumeUpload.phase.value,
  (phase) => {
    if (phase === 'done') finished.value = true
    if (phase === 'error') error.value = resumeUpload.errorMessage.value
  },
  { immediate: true },
)

const choose = () => {
  error.value = ''
  input.value?.click()
}

const onChange = (event: Event) => {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED.includes(ext)) {
    error.value = 'Please upload a PDF or DOCX file.'
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    error.value = 'That file is too large — please upload something under 10MB.'
    return
  }
  void resumeUpload.start(file)
}
</script>

<template>
  <main class="upload-tab">
    <h1>Upload your resume</h1>
    <p v-if="!finished && resumeUpload.phase.value !== 'uploading'">
      Choose a PDF or DOCX. GoFillr reads it and fills in your profile.
    </p>
    <button
      v-if="!finished && resumeUpload.phase.value !== 'uploading'"
      type="button"
      class="upload-tab-btn"
      @click="choose"
    >
      Choose file
    </button>
    <p v-if="resumeUpload.phase.value === 'uploading'">Reading {{ resumeUpload.fileName.value }}…</p>
    <p v-if="finished" class="ok">
      Done — {{ resumeUpload.fileName.value }} is saved. Click the GoFillr icon in your toolbar to
      review your profile. You can close this tab.
    </p>
    <p v-if="error" class="err">{{ error }}</p>
    <input ref="input" type="file" accept=".pdf,.docx" hidden @change="onChange" />
  </main>
</template>

<style scoped>
.upload-tab {
  max-width: 420px;
  margin: 12vh auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #ebebee;
  text-align: center;
}
.upload-tab-btn {
  border: none;
  border-radius: 9px;
  background: #7c3aed;
  color: #fff;
  font-weight: 600;
  padding: 11px 18px;
  cursor: pointer;
}
.ok { color: #9fd4a8; }
.err { color: #e08a8a; }
</style>
