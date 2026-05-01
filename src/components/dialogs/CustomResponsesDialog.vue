<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import type { CustomResponse } from '../../types'
import { NTag, NInput } from 'naive-ui'
import { useCustomResponses } from '../../composables/useCustomResponses'
import { useNotification } from '../../composables/useNotification'
import { coloredIcon, ICON_EDIT, ICON_XMARK } from '@/utils/icons'
import CreateResponseDialog from './CreateResponseDialog.vue'
import EditResponseDialog from './EditResponseDialog.vue'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  customResponses,
  loadCustomResponses,
  addCustomResponse,
  deleteCustomResponse,
  saveCustomResponse,
} = useCustomResponses()
const { notification, showNotification } = useNotification()

const dialogs = reactive({
  createResponse: { show: false },
  editResponse: { show: false, item: null as CustomResponse | null },

  confirmDelete: {
    show: false,
    item: null as CustomResponse | null,
  },
})

const handleAddResponse = (response: CustomResponse) => {
  addCustomResponse(response)
  dialogs.createResponse.show = false
}

const startEditingResponse = (response: CustomResponse) => {
  dialogs.editResponse.item = response
  dialogs.editResponse.show = true
}

const handleSaveEditedResponse = async (response: CustomResponse) => {
  await saveCustomResponse(response)
  showNotification('Response updated!', 'success')
  dialogs.editResponse.show = false
  dialogs.editResponse.item = null
}

const handleClose = () => {
  emit('close')
  dialogs.createResponse.show = false
}

const showDeleteConfirm = (response: CustomResponse) => {
  console.log('Showing delete confirm for response:', response)
  dialogs.confirmDelete.item = response
  dialogs.confirmDelete.show = true

  console.log('dialogs.confirmDelete after setting:', dialogs.confirmDelete)
}

const handleDelete = (id: number) => {
  deleteCustomResponse(id).then(() => {
    showNotification('Response deleted!', 'success')
  })
}
const resetConfirmDeleteDialog = () => {
  dialogs.confirmDelete.show = false
  dialogs.confirmDelete.item = null
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
          <div>
            <div v-if="customResponses.length === 0" class="empty-state">
              <p>No custom responses yet.</p>
              <p class="hint">
                Create a new response to quickly fill in common questions during your job
                applications!
              </p>
            </div>

            <div v-else class="responses-list">
              <div v-for="response in customResponses" :key="response.id" class="response-item">
                <div class="response-header">
                  <h4>{{ response.title }}</h4>
                  <div class="response-actions">
                    <button
                      class="edit-btn-small"
                      title="Edit response"
                      @click="startEditingResponse(response)"
                    >
                      <span v-html="coloredIcon(ICON_EDIT, '#3b82f6')" class="icon" />
                    </button>
                    <button
                      class="delete-btn"
                      title="Delete response"
                      @click="showDeleteConfirm(response)"
                    >
                      <span v-html="coloredIcon(ICON_XMARK, '#e53e3e')" class="icon" />
                    </button>
                  </div>
                </div>
                <p class="response-text">{{ response.text }}</p>
                <div v-if="response.tags.length > 0" class="response-tags">
                  <span v-for="tag in response.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary-dialog" @click="handleClose">Close</button>
          <button class="create-new-response-bttn" @click="dialogs.createResponse.show = true">
            + Create New Response
          </button>
        </div>
      </div>

      <CreateResponseDialog
        :show="dialogs.createResponse.show"
        @close="dialogs.createResponse.show = false"
        @add="handleAddResponse"
      />
      <EditResponseDialog
        :show="dialogs.editResponse.show"
        :item="dialogs.editResponse.item"
        @close="dialogs.editResponse.show = false"
        @save="handleSaveEditedResponse"
      />
      <ConfirmDeleteDialog
        :show="dialogs.confirmDelete.show"
        :item="dialogs.confirmDelete.item"
        @close="resetConfirmDeleteDialog()"
        @delete="handleDelete"
      />
    </div>
  </Transition>
</template>

<style>
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
.n-tag {
  background: #3b82f6 !important;
  color: #e2e8f0 !important;
  border: none !important;
  padding: 4px 10px !important;
  border-radius: 2em !important;
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
.n-input-wrapper {
  background: rgb(13, 17, 23) !important;
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
  transition: 0.1s;
  &:hover {
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
