<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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


onMounted(() => document.body.classList.add('gofillr-upload-tab'))
onBeforeUnmount(() => document.body.classList.remove('gofillr-upload-tab'))

const choose = () => {
  error.value = ''
  input.value?.click()
}

const onChange = (event: Event) => {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) accept(file)
}

const onDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0]
  if (file) accept(file)
}

const accept = (file: File) => {
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
  <main class="upload-tab" @dragover.prevent @drop.prevent="onDrop">
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

<style>
/* The tab is a normal page, not the dark popup shell: without a background the light text
   sat on the browser's white. Colors below are checked against #121216 for WCAG AA. */
body.gofillr-upload-tab {
  background: #121216;
  min-height: 100vh;
}
body.gofillr-upload-tab #app {
  width: auto;
}
</style>

<style scoped>
.upload-tab {
  max-width: 420px;
  margin: 12vh auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #ebebee; /* 15.6:1 on #121216 */
  text-align: center;
}
.upload-tab p {
  color: #c4c4cc; /* 10.6:1 on #121216 */
  line-height: 1.5;
}
.upload-tab-btn {
  border: none;
  border-radius: 9px;
  background: #6d28d9; /* white text 7.1:1 */
  color: #fff;
  font-weight: 600;
  padding: 11px 18px;
  cursor: pointer;
}
.upload-tab-btn:focus-visible {
  outline: 2px solid #c4b5fd;
  outline-offset: 2px;
}
.upload-tab .ok { color: #86efac; } /* 13.4:1 */
.upload-tab .err { color: #fca5a5; } /* 10.2:1 */
</style>
