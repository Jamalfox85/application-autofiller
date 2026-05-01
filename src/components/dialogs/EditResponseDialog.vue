<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CustomResponse } from '../../types'
import { NTag, NInput } from 'naive-ui'

const props = defineProps<{
  show: boolean
  item: CustomResponse | null
}>()

const emit = defineEmits<{
  close: []
  save: [response: CustomResponse]
}>()

const editingResponse = ref({ title: '', text: '', tags: [] as string[] })
const editTagInput = ref('')

// Populate form when item changes
watch(
  () => props.item,
  (item) => {
    if (item) {
      editingResponse.value = {
        title: item.title,
        text: item.text,
        tags: [...item.tags],
      }
    }
  },
)

function addEditTagFromInput() {
  const raw = editTagInput.value.trim()
  if (!raw) return
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((p) => {
      const normalized = p.toLowerCase()
      if (!editingResponse.value.tags.includes(normalized)) {
        editingResponse.value.tags.push(normalized)
      }
    })
  editTagInput.value = ''
}

function removeEditTag(tag: string) {
  editingResponse.value.tags = editingResponse.value.tags.filter((t) => t !== tag)
}

function handleEditTagInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    addEditTagFromInput()
  }
}

const handleSave = () => {
  if (!editingResponse.value.title.trim() || !editingResponse.value.text.trim()) return

  emit('save', {
    id: props.item!.id,
    title: editingResponse.value.title.trim(),
    text: editingResponse.value.text.trim(),
    tags: editingResponse.value.tags,
  })
}

const handleClose = () => {
  editTagInput.value = ''
  emit('close')
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Edit Response</h2>
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
          <div class="form-group">
            <label>Question/Title</label>
            <input
              type="text"
              v-model="editingResponse.title"
              placeholder="e.g., Why do you want this job?"
            />
          </div>
          <div class="form-group">
            <label>Your Response</label>
            <textarea
              v-model="editingResponse.text"
              rows="4"
              placeholder="Enter your response..."
            ></textarea>
          </div>
          <div class="form-group">
            <label>Key Words</label>
            <div v-if="editingResponse.tags.length > 0" class="tags-list">
              <NTag
                v-for="tag in editingResponse.tags"
                :key="tag"
                closable
                @close="removeEditTag(tag)"
              >
                {{ tag }}
              </NTag>
            </div>
            <NInput
              v-model:value="editTagInput"
              placeholder="Type a tag and press Enter"
              @keydown="handleEditTagInputKeydown"
              @blur="addEditTagFromInput"
            />
          </div>
          <div class="form-actions">
            <button type="button" class="btn-cancel" @click="handleClose">Cancel</button>
            <button type="button" class="btn-save" @click="handleSave">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
