<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CustomResponse } from '../../types'
import FullScreenSheet from './FullScreenSheet.vue'

const props = defineProps<{
  show: boolean
  item: CustomResponse | null
}>()

const emit = defineEmits<{
  close: []
  add: [response: CustomResponse]
  save: [response: CustomResponse]
  delete: [id: number]
}>()

const ANSWER_MAX = 1200
// Broadly useful starting tags — not derived from the response's own content, just a quick-add
// shortcut for categories that come up across most custom responses.
const SUGGESTED_TAGS = ['why this company', 'experience', 'salary', 'availability']

const question = ref('')
const answer = ref('')
const tags = ref<string[]>([])
const tagDraft = ref('')
const saved = ref(false)

const isReady = () => question.value.trim().length > 0 && answer.value.trim().length > 0

const resetForm = () => {
  if (props.item) {
    question.value = props.item.title
    answer.value = props.item.text
    tags.value = [...props.item.tags]
  } else {
    question.value = ''
    answer.value = ''
    tags.value = []
  }
  tagDraft.value = ''
  saved.value = false
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) resetForm()
  },
)

const addTagFromDraft = () => {
  const value = tagDraft.value.trim().toLowerCase()
  tagDraft.value = ''
  if (!value || tags.value.includes(value)) return
  tags.value.push(value)
  saved.value = false
}

const removeTag = (tag: string) => {
  tags.value = tags.value.filter((t) => t !== tag)
  saved.value = false
}

const addSuggestedTag = (tag: string) => {
  if (tags.value.includes(tag)) return
  tags.value.push(tag)
  saved.value = false
}

const handleTagDraftKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTagFromDraft()
  }
}

const handleClose = () => {
  emit('close')
}

const handleSave = () => {
  if (!isReady()) return
  const response: CustomResponse = {
    id: props.item?.id ?? Date.now(),
    title: question.value.trim(),
    text: answer.value.trim(),
    tags: tags.value,
  }
  if (props.item) {
    emit('save', response)
  } else {
    emit('add', response)
  }
  saved.value = true
}
</script>

<template>
  <FullScreenSheet :show="show" :title="item ? 'Edit response' : 'New response'" @close="handleClose">
    <template #status>{{ answer.length }}/{{ ANSWER_MAX }}</template>

    <div class="fs-form response-form">
      <label class="form-group">
        <span>Question</span>
        <input
          v-model="question"
          type="text"
          placeholder="e.g. Why do you want this job?"
        />
      </label>

      <label class="form-group">
        <span>Your response</span>
        <textarea
          v-model="answer"
          :maxlength="ANSWER_MAX"
          rows="6"
          placeholder="Write the answer you want filled in."
        ></textarea>
      </label>

      <div class="form-group">
        <div class="response-keywords-header">
          <span>Keywords</span>
          <span class="response-keywords-hint">Matches this answer to a field</span>
        </div>
        <div class="response-keywords-input">
          <span v-for="tag in tags" :key="tag" class="response-tag">
            {{ tag }}
            <button type="button" @click="removeTag(tag)">×</button>
          </span>
          <input
            v-model="tagDraft"
            type="text"
            placeholder="Type a tag and press Enter"
            @keydown="handleTagDraftKeydown"
          />
        </div>
        <div class="response-suggested">
          <button
            v-for="tag in SUGGESTED_TAGS.filter((t) => !tags.includes(t))"
            :key="tag"
            type="button"
            class="response-suggested-tag"
            @click="addSuggestedTag(tag)"
          >
            + {{ tag }}
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        v-if="item"
        type="button"
        class="response-delete-link"
        @click="emit('delete', item.id)"
      >
        Delete
      </button>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button
        class="btn-primary-dialog"
        :class="{ 'save-btn-saved': saved }"
        :disabled="!isReady()"
        @click="handleSave"
      >
        {{ saved ? 'Saved' : item ? 'Save changes' : 'Save response' }}
      </button>
    </template>
  </FullScreenSheet>
</template>

<style scoped>
.response-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.response-form .form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.response-form .form-group > span:first-child {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c7c86;
}

.response-keywords-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.response-keywords-hint {
  font-size: 10.5px;
  color: #5c5c66;
  text-transform: none;
  letter-spacing: 0;
  font-family: 'IBM Plex Sans', sans-serif;
}

.response-keywords-input {
  border: 1px solid #2b2b33;
  background: #101014;
  border-radius: 7px;
  padding: 7px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.response-keywords-input input {
  flex: 1;
  min-width: 120px;
  border: none;
  background: none;
  color: #ebebee;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  padding: 4px 2px;
}

.response-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #c4b5fd;
  border: 1px solid #3a2f5e;
  background: rgba(124, 58, 237, 0.14);
  border-radius: 20px;
  padding: 3px 4px 3px 8px;
}

.response-tag button {
  border: none;
  background: none;
  color: #a78bfa;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 0 3px;
}

.response-tag button:hover {
  color: #ebebee;
}

.response-suggested {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 2px;
}

.response-suggested-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #8f8f99;
  border: 1px dashed #33333d;
  background: none;
  border-radius: 20px;
  padding: 3px 8px;
  cursor: pointer;
}

.response-suggested-tag:hover {
  color: #ebebee;
  border-color: #47475a;
}

.save-btn-saved {
  background: #2f2350 !important;
}

.response-delete-link {
  margin-right: auto;
  border: none;
  background: none;
  color: #a15c5c;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  padding: 9px 4px;
}

.response-delete-link:hover {
  color: #e08a8a;
}
</style>
