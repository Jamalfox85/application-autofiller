<script setup lang="ts">
import { ref } from 'vue'
import type { CustomResponse } from '../../types'
import { NTag, NInput } from 'naive-ui'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  add: [response: CustomResponse]
}>()

const newResponse = ref({ title: '', text: '', tags: [] as string[] })
const tagInput = ref('')

function addTagFromInput() {
  const raw = tagInput.value.trim()
  if (!raw) return
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((p) => {
      const normalized = p.toLowerCase()
      if (!newResponse.value.tags.includes(normalized)) {
        newResponse.value.tags.push(normalized)
      }
    })
  tagInput.value = ''
}

function removeTag(tag: string) {
  newResponse.value.tags = newResponse.value.tags.filter((t) => t !== tag)
}

function handleTagInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    addTagFromInput()
  }
}

const handleSubmit = () => {
  if (!newResponse.value.title.trim() || !newResponse.value.text.trim()) return

  emit('add', {
    id: Date.now(),
    title: newResponse.value.title.trim(),
    text: newResponse.value.text.trim(),
    tags: newResponse.value.tags,
  })

  reset()
}

const reset = () => {
  newResponse.value = { title: '', text: '', tags: [] }
  tagInput.value = ''
}

const handleClose = () => {
  reset()
  emit('close')
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Create New Response</h2>
          <button class="close-btn" @click="handleClose">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div class="dialog-content">
          <form @submit.prevent="handleSubmit" @keydown.enter.prevent>
            <div class="form-group">
              <label for="dialogResponseTitle">Question/Title</label>
              <input
                type="text"
                id="dialogResponseTitle"
                v-model="newResponse.title"
                placeholder="e.g., Why do you want this job?"
              />
            </div>
            <div class="form-group">
              <label for="dialogResponseText">Your Response</label>
              <textarea
                id="dialogResponseText"
                v-model="newResponse.text"
                rows="4"
                placeholder="Enter your response..."
              ></textarea>
            </div>
            <div class="form-group">
              <label>Key Words</label>
              <div v-if="newResponse.tags.length > 0" class="tags-list">
                <NTag v-for="tag in newResponse.tags" :key="tag" closable @close="removeTag(tag)">
                  {{ tag }}
                </NTag>
              </div>
              <NInput
                v-model:value="tagInput"
                placeholder="Type a tag and press Enter"
                @keydown="handleTagInputKeydown"
                @blur="addTagFromInput"
              />
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="handleClose">Cancel</button>
              <button type="submit" class="btn-save">Save Response</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Transition>
</template>
