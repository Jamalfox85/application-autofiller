<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { CustomResponse } from '../../types'
import { NTag, NInput } from 'naive-ui'
import { useCustomResponses } from '../../composables/useCustomResponses'
import { useNotification } from '../../composables/useNotification'

defineProps<{
  show: boolean
  //   customResponses: CustomResponse[]
}>()

const emit = defineEmits<{
  close: []
  //   addResponse: [response: CustomResponse]
  //   updateResponse: [response: CustomResponse]
  //   deleteResponse: [id: number]
}>()

const { loadCustomResponses, addCustomResponse, deleteCustomResponse, saveCustomResponse } =
  useCustomResponses()
const { notification, showNotification } = useNotification()

const customResponses = ref<any[]>([])
const showCreateResponseForm = ref(false)
const newResponse = ref<{
  title: string
  text: string
  tags: string[]
}>({
  title: '',
  text: '',
  tags: [],
})
const tagInput = ref('')

const handleAddResponse = () => {
  if (!newResponse.value.title.trim() || !newResponse.value.text.trim()) {
    return
  }

  const response: CustomResponse = {
    id: Date.now(), // Using timestamp as a simple unique ID. Replace with generated id when switching to supabase
    title: newResponse.value.title.trim(),
    text: newResponse.value.text.trim(),
    tags: newResponse.value.tags,
  }

  addCustomResponse(response)

  // Clear form
  newResponse.value = { title: '', text: '', tags: [] }
  tagInput.value = ''
  showCreateResponseForm.value = false
}

function addTagFromInput() {
  const raw = tagInput.value.trim()
  if (!raw) return

  const parts = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  for (const p of parts) {
    const normalized = p.toLowerCase()
    if (!newResponse.value.tags.includes(normalized)) {
      newResponse.value.tags.push(normalized)
    }
  }

  tagInput.value = ''
}

function removeTag(tag: string) {
  newResponse.value.tags = newResponse.value.tags.filter((t) => t !== tag)
}

function handleTagInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // Prevent form submit / modal close
    e.preventDefault()
    e.stopPropagation()
    addTagFromInput()
  }
}

const editingResponseId = ref<number | null>(null)
const editingResponse = ref<{
  title: string
  text: string
  tags: string[]
}>({
  title: '',
  text: '',
  tags: [],
})

const startEditingResponse = (response: CustomResponse) => {
  editingResponseId.value = response.id
  editingResponse.value = {
    title: response.title,
    text: response.text,
    tags: [...response.tags],
  }
}

const resetEditingResponse = () => {
  editingResponseId.value = null
  editingResponse.value = {
    title: '',
    text: '',
    tags: [],
  }
}

const saveEditedResponse = async () => {
  if (!editingResponse.value.title.trim() || !editingResponse.value.text.trim()) {
    return
  }

  const response: CustomResponse = {
    id: editingResponseId.value!,
    title: editingResponse.value.title.trim(),
    text: editingResponse.value.text.trim(),
    tags: editingResponse.value.tags,
  }

  await saveCustomResponse(response).then(() => {
    showNotification('Response updated!', 'success')
    resetEditingResponse()
  })
}

const editTagInput = ref('')

function addEditTagFromInput() {
  const raw = editTagInput.value.trim()
  if (!raw) return

  const parts = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  for (const p of parts) {
    const normalized = p.toLowerCase()
    if (!editingResponse.value.tags.includes(normalized)) {
      editingResponse.value.tags.push(normalized)
    }
  }

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

const handleClose = () => {
  emit('close')
  showCreateResponseForm.value = false
  newResponse.value = { title: '', text: '', tags: [] }
}

const handleDelete = (id: number) => {
  deleteCustomResponse(id).then(() => {
    showNotification('Response deleted!', 'success')
  })
}

onMounted(async () => {
  await loadCustomResponses()
})
</script>

<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Edit Custom Responses</h2>
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
          <!-- Create New Response Form -->
          <div v-if="showCreateResponseForm" class="create-response-form">
            <h3>Create New Response</h3>
            <form @submit.prevent="handleAddResponse" @keydown.enter.prevent>
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
                <label for="dialogResponseTags">Key Words</label>
                <!-- Existing tags list (nice UX) -->
                <div
                  v-if="newResponse.tags.length > 0"
                  class="tags-list"
                  style="margin-bottom: 8px"
                >
                  <NTag
                    v-for="tag in newResponse.tags"
                    :key="tag"
                    closable
                    @close="removeTag(tag)"
                    style="margin-right: 6px; margin-bottom: 6px"
                  >
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
                <button type="button" class="btn-cancel" @click="showCreateResponseForm = false">
                  Cancel
                </button>
                <button type="submit" class="btn-save">Save Response</button>
              </div>
            </form>
          </div>

          <!-- Responses List -->
          <div v-else>
            <div v-if="customResponses.length === 0" class="empty-state">
              <p>No custom responses yet.</p>
              <p class="hint">
                Create a new response to quickly fill in common questions during your job
                applications!
              </p>
            </div>

            <div v-else class="responses-list">
              <div v-for="response in customResponses" :key="response.id" class="response-item">
                <!-- View Mode -->
                <div v-if="editingResponseId !== response.id">
                  <div class="response-header">
                    <h4>{{ response.title }}</h4>
                    <div class="response-actions">
                      <button
                        class="edit-btn-small"
                        title="Edit response"
                        @click="startEditingResponse(response)"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                          <path
                            d="M0 11.083V14h2.917l8.6-8.6-2.917-2.917-8.6 8.6zM13.733 2.483a.774.774 0 000-1.096L12.613.267a.774.774 0 00-1.096 0l-.88.88 2.917 2.916.88-.88z"
                          />
                        </svg>
                      </button>
                      <button
                        class="delete-btn"
                        title="Delete response"
                        @click="handleDelete(response.id)"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p class="response-text">{{ response.text }}</p>
                  <div v-if="response.tags.length > 0" class="response-tags">
                    <span v-for="tag in response.tags" :key="tag" class="tag">
                      {{ tag }}
                    </span>
                  </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="edit-response-form">
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
                    <div
                      v-if="editingResponse.tags.length > 0"
                      class="tags-list"
                      style="margin-bottom: 8px"
                    >
                      <NTag
                        v-for="tag in editingResponse.tags"
                        :key="tag"
                        closable
                        @close="removeEditTag(tag)"
                        style="margin-right: 6px; margin-bottom: 6px"
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
                    <button type="button" class="btn-cancel" @click="resetEditingResponse">
                      Cancel
                    </button>
                    <button type="button" class="btn-save" @click="saveEditedResponse">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button
            v-if="!showCreateResponseForm"
            class="create-new-response-bttn"
            @click="showCreateResponseForm = true"
          >
            + Create New Response
          </button>
          <button class="btn-secondary-dialog" @click="handleClose">Close</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Empty State */
.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-state p {
  color: #a0aec0;
  font-size: 14px;
  margin: 8px 0;
}

.empty-state .hint {
  font-size: 13px;
  color: #718096;
}

/* Create Response Form */
.create-response-form {
  background: #2d3748;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.create-response-form h3 {
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0 0 16px 0;
}

.create-response-form .form-group {
  margin-bottom: 16px;
}

.create-response-form label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.create-response-form input[type='text'],
.create-response-form textarea {
  width: 100%;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
}

.create-response-form input:focus,
.create-response-form textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.create-response-form textarea {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

.btn-cancel {
  padding: 10px 20px;
  background: #2d3748;
  color: #e2e8f0;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel:hover {
  background: #4a5568;
}

.btn-save {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #3baef6;
    box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    transform: translateY(-1px);
  }
}

/* Responses List */
.responses-list .response-item {
  background: #2d3748;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #4a5568;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.response-header h4 {
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0;
}

.delete-btn {
  background: none;
  border: none;
  color: #e53e3e;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 16px;
  transition: color 0.2s;
}

.delete-btn:hover {
  color: #c53030;
}

.response-text {
  font-size: 14px;
  color: #e2e8f0;
  margin: 0 0 8px 0;
}

.response-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  background: #4a5568;
  color: #e2e8f0;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* Footer Buttons */
.create-new-response-bttn {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-right: auto;
  &:hover {
    background: #3baef6;
    box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    transform: translateY(-1px);
  }
}

.btn-secondary-dialog {
  padding: 10px 20px;
  background: #2d3748;
  color: #e2e8f0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary-dialog:hover {
  background: #4a5568;
}
.tags-list {
  display: flex;
  flex-wrap: wrap;
}

/* Tags styling */
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 32px;
}

/* Override Naive UI NTag styles */
:deep(.n-tag) {
  background: #4a5568 !important;
  color: #e2e8f0 !important;
  border: none !important;
  padding: 4px 10px !important;
  border-radius: 12px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
}

:deep(.n-tag .n-tag__close) {
  color: #e2e8f0 !important;
  margin-left: 6px !important;
}

:deep(.n-tag .n-tag__close:hover) {
  color: #ef4444 !important;
}

/* Override Naive UI NInput styles */
:deep(.n-input) {
  background: #1a202c !important;
  border: none !important;
  border-radius: 6px !important;
}

:deep(.n-input__input-el) {
  padding: 10px 12px !important;
  background: transparent !important;
  color: #e2e8f0 !important;
  font-size: 14px !important;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif !important;
}

:deep(.n-input__input-el::placeholder) {
  color: #718096 !important;
}

:deep(.n-input:hover) {
  border-color: #4a5568 !important;
}

:deep(.n-input.n-input--focus) {
  border-color: #3b82f6 !important;
  box-shadow: none !important;
}

:deep(.n-input__state-border) {
  display: none !important;
}

/* Remove default Naive UI box shadow */
:deep(.n-input__border),
:deep(.n-input__state-border) {
  border: none !important;
  box-shadow: none !important;
}

/* Response Actions */
.response-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-btn-small {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
  &:hover {
    background: #3baef6;
    box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    transform: translateY(-1px);
  }
}

/* Edit Response Form */
.edit-response-form {
  width: 100%;
}

.edit-response-form .form-group {
  margin-bottom: 12px;
}

.edit-response-form label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.edit-response-form input[type='text'],
.edit-response-form textarea {
  width: 100%;
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
}

.edit-response-form input:focus,
.edit-response-form textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.edit-response-form textarea {
  resize: vertical;
  min-height: 80px;
}

.edit-response-form .form-actions {
  margin-top: 12px;
}
</style>
