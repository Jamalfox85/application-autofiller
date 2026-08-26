<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { ApplicationAccount, PersonalInfo } from '../../types/index.ts'
import { useNotification } from '../../composables/useNotification'
import ApplicationAccountFormDialog from './ApplicationAccountFormDialog.vue'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'
import SectionSheet from './SectionSheet.vue'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  save: [profile: PersonalInfo]
}>()

const { showNotification } = useNotification()

const accounts = ref<ApplicationAccount[]>([...(props.personalInfo.applicationAccounts ?? [])])

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      accounts.value = [...(props.personalInfo.applicationAccounts ?? [])]
    }
  },
)

const dialogs = reactive({
  accountForm: { show: false, item: null as ApplicationAccount | null },
  confirmDelete: { show: false, item: null as { id: number; title: string } | null },
})

const persist = () => {
  emit('save', { ...props.personalInfo, applicationAccounts: accounts.value })
}

const openAdd = () => {
  dialogs.accountForm.item = null
  dialogs.accountForm.show = true
}

const openEdit = (account: ApplicationAccount) => {
  dialogs.accountForm.item = account
  dialogs.accountForm.show = true
}

const handleAdd = (account: ApplicationAccount) => {
  accounts.value.push(account)
  persist()
  showNotification('Account saved!', 'success')
}

const handleSaveEdit = (account: ApplicationAccount) => {
  const index = accounts.value.findIndex((a) => a.id === account.id)
  if (index !== -1) accounts.value[index] = account
  persist()
  showNotification('Account updated!', 'success')
}

const handleDeleteRequest = (id: number) => {
  const account = accounts.value.find((a) => a.id === id)
  if (!account) return
  dialogs.accountForm.show = false
  dialogs.confirmDelete.item = { id: account.id, title: account.portal }
  dialogs.confirmDelete.show = true
}

const handleDelete = (id: number) => {
  accounts.value = accounts.value.filter((a) => a.id !== id)
  persist()
  showNotification('Account deleted!', 'success')
}

const resetConfirmDeleteDialog = () => {
  dialogs.confirmDelete.show = false
  dialogs.confirmDelete.item = null
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <SectionSheet
    :show="show"
    title="Application accounts"
    subtitle="Logins for job portals like Workday"
    fullscreen
    @close="handleClose"
  >
    <div class="aa-wrap">
      <div class="aa-notice">
        <span class="aa-notice-dot"></span>
        <span>Stored encrypted on this device. GoFillr fills the login form — it never submits it for you.</span>
      </div>

      <div v-if="accounts.length === 0" class="aa-empty">
        No accounts saved yet. Add one for each job portal you apply through.
      </div>

      <div v-else class="aa-list">
        <button
          v-for="account in accounts"
          :key="account.id"
          type="button"
          class="aa-row"
          @click="openEdit(account)"
        >
          <span class="aa-badge">{{ account.portal.charAt(0) }}</span>
          <div class="aa-row-copy">
            <div class="aa-row-portal">{{ account.portal }}</div>
            <div class="aa-row-email">{{ account.email }}</div>
          </div>
          <div class="aa-row-pw">••••••••</div>
        </button>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Close</button>
      <button class="btn-primary-dialog" @click="openAdd">Add account</button>
    </template>
  </SectionSheet>

  <ApplicationAccountFormDialog
    :show="dialogs.accountForm.show"
    :item="dialogs.accountForm.item"
    @close="dialogs.accountForm.show = false"
    @add="handleAdd"
    @save="handleSaveEdit"
    @delete="handleDeleteRequest"
  />
  <ConfirmDeleteDialog
    :show="dialogs.confirmDelete.show"
    :item="dialogs.confirmDelete.item"
    label="account"
    @close="resetConfirmDeleteDialog()"
    @delete="handleDelete"
  />
</template>

<style scoped>
.aa-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.aa-notice {
  display: flex;
  gap: 9px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 10px;
  padding: 10px 11px;
  flex-shrink: 0;
}

.aa-notice-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #3a2f5e;
  background: rgba(124, 58, 237, 0.18);
  flex: none;
  margin-top: 1px;
}

.aa-notice span:last-child {
  font-size: 11px;
  color: #8f8f99;
  line-height: 1.5;
}

.aa-empty {
  font-size: 12px;
  color: #8f8f99;
  line-height: 1.5;
  padding: 4px 2px;
}

.aa-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.aa-row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 9px;
  padding: 10px 11px;
  color: #ebebee;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.aa-row:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.aa-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  background: #1e1e24;
  border: 1px solid #2b2b33;
  color: #8f8f99;
}

.aa-row-copy {
  min-width: 0;
}

.aa-row-portal {
  font-size: 12.5px;
  font-weight: 500;
}

.aa-row-email {
  font-size: 11px;
  color: #8f8f99;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aa-row-pw {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
  text-align: right;
}
</style>
