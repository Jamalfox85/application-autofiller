<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import type { CustomResponse } from '../../types'
import { useCustomResponses } from '../../composables/useCustomResponses'
import { useNotification } from '../../composables/useNotification'
import ResponseFormDialog from './ResponseFormDialog.vue'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'
import SectionSheet from './SectionSheet.vue'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { customResponses, loadCustomResponses, addCustomResponse, deleteCustomResponse, saveCustomResponse } =
  useCustomResponses()
const { showNotification } = useNotification()

const search = ref('')

const filteredResponses = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return customResponses.value
  return customResponses.value.filter(
    (r) =>
      r.title.toLowerCase().includes(query) ||
      r.text.toLowerCase().includes(query) ||
      r.tags.some((t) => t.toLowerCase().includes(query)),
  )
})

const dialogs = reactive({
  responseForm: { show: false, item: null as CustomResponse | null },
  confirmDelete: { show: false, item: null as CustomResponse | null },
})

const openCreate = () => {
  dialogs.responseForm.item = null
  dialogs.responseForm.show = true
}

const openEdit = (response: CustomResponse) => {
  dialogs.responseForm.item = response
  dialogs.responseForm.show = true
}

const handleAdd = (response: CustomResponse) => {
  addCustomResponse(response)
  showNotification('Response saved!', 'success')
}

const handleSaveEdit = async (response: CustomResponse) => {
  await saveCustomResponse(response)
  showNotification('Response updated!', 'success')
}

const handleDeleteRequest = (id: number) => {
  const item = customResponses.value.find((r) => r.id === id) ?? null
  dialogs.responseForm.show = false
  dialogs.confirmDelete.item = item
  dialogs.confirmDelete.show = true
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

const handleClose = () => {
  emit('close')
}

onMounted(async () => {
  await loadCustomResponses()
})
</script>

<template>
  <SectionSheet
    :show="show"
    title="Custom responses"
    subtitle="Tailor responses for specific questions"
    fullscreen
    @close="handleClose"
  >
    <div v-if="customResponses.length === 0" class="cr-empty">
      <div class="cr-empty-icon">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="cr-empty-title">No custom responses yet.</div>
      <div class="cr-empty-text">
        Create a new response to quickly fill in common questions during your job applications.
      </div>
    </div>

    <div v-else class="cr-list-wrap">
      <input v-model="search" type="text" class="cr-search" placeholder="Search responses" />

      <div class="cr-list">
        <button
          v-for="response in filteredResponses"
          :key="response.id"
          type="button"
          class="cr-card"
          @click="openEdit(response)"
        >
          <div class="cr-card-question">{{ response.title }}</div>
          <div class="cr-card-answer">{{ response.text }}</div>
          <div v-if="response.tags.length > 0" class="cr-card-tags">
            <span v-for="tag in response.tags" :key="tag" class="cr-card-tag">{{ tag }}</span>
          </div>
        </button>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Close</button>
      <button class="btn-primary-dialog" @click="openCreate">New response</button>
    </template>
  </SectionSheet>

  <ResponseFormDialog
    :show="dialogs.responseForm.show"
    :item="dialogs.responseForm.item"
    @close="dialogs.responseForm.show = false"
    @add="handleAdd"
    @save="handleSaveEdit"
    @delete="handleDeleteRequest"
  />
  <ConfirmDeleteDialog
    :show="dialogs.confirmDelete.show"
    :item="dialogs.confirmDelete.item"
    @close="resetConfirmDeleteDialog()"
    @delete="handleDelete"
  />
</template>

<style scoped>
.cr-empty {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 28px;
  text-align: center;
}

.cr-empty-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0 9px;
}

.cr-empty-icon span:nth-child(1) {
  height: 3px;
  border-radius: 2px;
  background: #7c3aed;
}

.cr-empty-icon span:nth-child(2) {
  height: 3px;
  border-radius: 2px;
  background: #4c3a86;
  width: 64%;
}

.cr-empty-icon span:nth-child(3) {
  height: 3px;
  border-radius: 2px;
  background: #2e2740;
  width: 40%;
}

.cr-empty-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.cr-empty-text {
  font-size: 12px;
  color: #8f8f99;
  line-height: 1.55;
  max-width: 268px;
}

.cr-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.cr-search {
  border: 1px solid #2b2b33;
  background: #101014;
  color: #ebebee;
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}

.cr-search:focus {
  border-color: #7c3aed;
}

.cr-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.cr-card {
  text-align: left;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 9px;
  padding: 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
}

.cr-card:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.cr-card-question {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
}

.cr-card-answer {
  font-size: 11.5px;
  color: #8f8f99;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cr-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cr-card-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #c4b5fd;
  border: 1px solid #3a2f5e;
  background: rgba(124, 58, 237, 0.12);
  border-radius: 20px;
  padding: 2px 7px;
}
</style>
