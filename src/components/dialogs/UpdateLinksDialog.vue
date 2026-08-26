<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { api } from '@/lib/api'
import { mergeParsedResumeIntoProfile } from '@/utils/resumeParsing'
import type { PersonalInfo, OtherLink } from '../../types/index.ts'
import SectionSheet from './SectionSheet.vue'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  save: [profile: PersonalInfo]
}>()

const ACCEPTED_RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx']

const LINK_TYPES = [
  { label: 'Dribbble', ph: 'dribbble.com/you' },
  { label: 'Behance', ph: 'behance.net/you' },
  { label: 'X', ph: 'x.com/you' },
  { label: 'Other', ph: 'example.com' },
]
const urlPattern = /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i
const stripProtocol = (value: string) => value.replace(/^https?:\/\//i, '')

const editableProfile = ref<PersonalInfo>({
  ...props.personalInfo,
})
const saved = ref(false)
const resumeParsing = ref(false)
const resumeError = ref('')
const resumeInput = ref<HTMLInputElement | null>(null)
let savedTimeout: ReturnType<typeof setTimeout> | undefined

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

const triggerResumePicker = () => {
  resumeError.value = ''
  resumeInput.value?.click()
}

const handleResumeChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_RESUME_EXTENSIONS.includes(extension)) {
    resumeError.value = 'Please upload a PDF or Word document (.pdf, .doc, .docx).'
    return
  }

  resumeParsing.value = true
  resumeError.value = ''
  try {
    const parsed = await api.parseResume(file)
    editableProfile.value = mergeParsedResumeIntoProfile(editableProfile.value, parsed, file.name)
    saved.value = false
  } catch (error) {
    resumeError.value =
      error instanceof Error ? error.message : 'Something went wrong reading that resumé.'
  } finally {
    resumeParsing.value = false
  }
}

function makeLinkModel(key: 'linkedin' | 'website' | 'github') {
  return computed({
    get: () => stripProtocol(editableProfile.value[key] || ''),
    set: (value: string) => {
      const bare = stripProtocol(value)
      editableProfile.value[key] = bare ? `https://${bare}` : ''
      saved.value = false
    },
  })
}
const linkedinModel = makeLinkModel('linkedin')
const websiteModel = makeLinkModel('website')
const githubModel = makeLinkModel('github')

const isInvalid = (value: string) => value.trim().length > 0 && !urlPattern.test(value.trim())

const availableLinkTypes = computed(() =>
  LINK_TYPES.filter(
    (t) => !(editableProfile.value.otherLinks ?? []).some((l) => l.label === t.label),
  ),
)

const addOtherLink = (type: (typeof LINK_TYPES)[number]) => {
  if (!editableProfile.value.otherLinks) editableProfile.value.otherLinks = []
  editableProfile.value.otherLinks.push({ id: Date.now(), label: type.label, url: '' })
  saved.value = false
}

const removeOtherLink = (id: number) => {
  editableProfile.value.otherLinks = (editableProfile.value.otherLinks ?? []).filter(
    (l) => l.id !== id,
  )
  saved.value = false
}

const setOtherLinkUrl = (link: OtherLink, value: string) => {
  const bare = stripProtocol(value)
  link.url = bare ? `https://${bare}` : ''
  saved.value = false
}

const placeholderFor = (label: string) => LINK_TYPES.find((t) => t.label === label)?.ph ?? ''

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
      saved.value = false
      resumeError.value = ''
      resumeParsing.value = false
    }
  },
)

onBeforeUnmount(() => clearTimeout(savedTimeout))
</script>
<template>
  <SectionSheet
    :show="show"
    title="Links & files"
    subtitle="Resumé, portfolio, LinkedIn"
    fullscreen
    @close="handleClose"
  >
    <div class="links-form">
      <div class="links-group">
        <div class="fs-group-header">
          <span class="fs-group-label">Files</span>
          <span class="fs-group-hint">Filename only — not uploaded anywhere</span>
        </div>

        <div class="file-card">
          <div class="file-card-main">
            <div class="file-card-title">Resumé</div>
            <div class="file-card-name">
              {{ editableProfile.resumeFileName || 'No resumé on file yet' }}
            </div>
            <div v-if="editableProfile.resumeFileName" class="file-card-meta">
              Used to pre-fill your profile
            </div>
          </div>
          <button
            type="button"
            class="file-card-action"
            :disabled="resumeParsing"
            @click="triggerResumePicker"
          >
            {{ resumeParsing ? 'Reading…' : editableProfile.resumeFileName ? 'Replace' : 'Upload' }}
          </button>
        </div>

        <p v-if="resumeError" class="file-error">{{ resumeError }}</p>

        <input
          ref="resumeInput"
          type="file"
          accept=".pdf,.doc,.docx"
          class="visually-hidden"
          @change="handleResumeChange"
        />
      </div>

      <div class="fs-divider"></div>

      <div class="links-group">
        <div class="fs-group-header">
          <span class="fs-group-label">Links</span>
          <span class="fs-group-hint">https:// is added for you</span>
        </div>

        <label class="link-field">
          <span class="link-field-header">
            <span class="fs-group-label">LinkedIn</span>
            <span v-if="isInvalid(linkedinModel)" class="fs-error">Doesn't look like a URL</span>
          </span>
          <span class="link-input-wrap" :class="{ invalid: isInvalid(linkedinModel) }">
            <span class="link-prefix">https://</span>
            <input v-model="linkedinModel" type="text" placeholder="linkedin.com/in/you" />
          </span>
        </label>

        <label class="link-field">
          <span class="link-field-header">
            <span class="fs-group-label">Portfolio</span>
            <span v-if="isInvalid(websiteModel)" class="fs-error">Doesn't look like a URL</span>
          </span>
          <span class="link-input-wrap" :class="{ invalid: isInvalid(websiteModel) }">
            <span class="link-prefix">https://</span>
            <input v-model="websiteModel" type="text" placeholder="yoursite.com" />
          </span>
        </label>

        <label class="link-field">
          <span class="link-field-header">
            <span class="fs-group-label">GitHub</span>
            <span v-if="isInvalid(githubModel)" class="fs-error">Doesn't look like a URL</span>
          </span>
          <span class="link-input-wrap" :class="{ invalid: isInvalid(githubModel) }">
            <span class="link-prefix">https://</span>
            <input v-model="githubModel" type="text" placeholder="github.com/you" />
          </span>
        </label>

        <label
          v-for="link in editableProfile.otherLinks ?? []"
          :key="link.id"
          class="link-field"
        >
          <span class="link-field-header">
            <span class="fs-group-label">{{ link.label }}</span>
            <span class="link-field-actions">
              <span v-if="isInvalid(stripProtocol(link.url))" class="fs-error">Doesn't look like a URL</span>
              <button type="button" class="link-remove" @click="removeOtherLink(link.id)">Remove</button>
            </span>
          </span>
          <span class="link-input-wrap" :class="{ invalid: isInvalid(stripProtocol(link.url)) }">
            <span class="link-prefix">https://</span>
            <input
              :value="stripProtocol(link.url)"
              type="text"
              :placeholder="placeholderFor(link.label)"
              @input="setOtherLinkUrl(link, ($event.target as HTMLInputElement).value)"
            />
          </span>
        </label>

        <div v-if="availableLinkTypes.length > 0" class="link-type-options">
          <button
            v-for="type in availableLinkTypes"
            :key="type.label"
            type="button"
            class="link-type-chip"
            @click="addOtherLink(type)"
          >
            + {{ type.label }}
          </button>
        </div>
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
.links-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.file-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
  border-radius: 9px;
  padding: 11px 12px;
}

.file-card-main {
  min-width: 0;
}

.file-card-title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6f6f7a;
}

.file-card-name {
  font-size: 12.5px;
  font-weight: 500;
  color: #ebebee;
  margin-top: 4px;
  word-break: break-word;
}

.file-card-meta {
  font-size: 11px;
  color: #7c7c86;
  margin-top: 3px;
  line-height: 1.45;
}

.file-card-action {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #a78bfa;
  border-radius: 6px;
  padding: 5px 9px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.file-card-action:hover:not(:disabled) {
  color: #c4b5fd;
  border-color: #47475a;
}

.file-card-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.file-error {
  font-size: 11px;
  color: #e08a8a;
  margin: 0;
  line-height: 1.45;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.links-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.link-field-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.link-field-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.link-remove {
  border: none;
  background: none;
  color: #7c7c86;
  cursor: pointer;
  font-family: inherit;
  font-size: 10.5px;
  padding: 0;
}

.link-remove:hover {
  color: #e08a8a;
}

.link-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #2b2b33;
  background: #101014;
  border-radius: 7px;
  padding: 8px 10px;
}

.link-input-wrap.invalid {
  border-color: #7a3b3b;
}

.link-prefix {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #5c5c66;
  flex-shrink: 0;
}

.link-input-wrap input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  color: #ebebee;
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  padding: 0;
}

.link-type-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.link-type-chip {
  font-size: 11.5px;
  color: #a78bfa;
  border: 1px dashed #3a2f5e;
  background: none;
  border-radius: 20px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.link-type-chip:hover {
  color: #c4b5fd;
  border-color: #4c3a86;
  background: rgba(124, 58, 237, 0.08);
}

.save-btn-saved {
  background: #2f2350 !important;
}
</style>
