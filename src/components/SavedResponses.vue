<script setup lang="ts">
import { ref, onMounted } from 'vue'
import SavedResponsesDialog from './dialogs/SavedResponsesDialog.vue'
import { useSavedResponses } from '../composables/useSavedResponses'
import { useNotification } from '../composables/useNotification'
import type { SavedResponse } from '../types'

const showQuestionsDialog = ref(false)

const { savedResponses, loadSavedResponses, addSavedResponse, deleteSavedResponse } =
  useSavedResponses()
const { notification, showNotification } = useNotification()

const handleAddResponse = async (response: SavedResponse) => {
  await addSavedResponse(response)
  showNotification('Response saved!')
}
const handleUpdateResponse = async (response: SavedResponse) => {
  const index = savedResponses.value.findIndex((r) => r.id === response.id)
  if (index !== -1) {
    savedResponses.value[index] = response
    await chrome.storage.local.set({
      savedResponses: JSON.parse(JSON.stringify(savedResponses.value)),
    })
    showNotification('Response updated!')
  }
}
const handleDeleteResponse = async (id: number) => {
  await deleteSavedResponse(id)
  showNotification('Response deleted!')
}

onMounted(async () => {
  await loadSavedResponses()
})
</script>

<template>
  <div>
    <div class="section">
      <h3 class="section-title">SAVED RESPONSES</h3>
      <div class="questions-item">
        <div class="questions-info">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="#59C9A5">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path
              fill-rule="evenodd"
              d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
              clip-rule="evenodd"
            />
          </svg>
          <span>
            {{ savedResponses.length }} saved response{{ savedResponses.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <button class="view-btn" @click="showQuestionsDialog = true">View Responses</button>
      </div>
    </div>
    <SavedResponsesDialog
      :show="showQuestionsDialog"
      :saved-responses="savedResponses"
      @close="showQuestionsDialog = false"
      @add-response="handleAddResponse"
      @update-response="handleUpdateResponse"
      @delete-response="handleDeleteResponse"
    />
  </div>
</template>

<style scoped lang="scss">
.questions-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-radius: 8px;
  .questions-info {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #e2e8f0;
  }
  .view-btn {
    background: none;
    border: none;
    color: #59c9a5;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
