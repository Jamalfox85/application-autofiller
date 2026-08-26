<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    item: { id: number; title: string } | null
    label?: string
  }>(),
  { label: 'response' },
)

const emit = defineEmits<{
  close: []
  delete: [id: number]
}>()

const confirmDelete = () => {
  if (props.item) {
    emit('delete', props.item.id)
  }
  handleClose()
}

const handleClose = () => {
  emit('close')
}
</script>
<template>
  <BaseDialog :show="show" title="Confirm Delete" @close="handleClose">
    <p>
      Are you sure you want to delete the {{ label }} "<strong>{{ item?.title }}</strong
      >"?
    </p>
    <p>This action cannot be undone.</p>

    <template #footer>
      <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
      <button class="btn-primary-dialog delete" @click="confirmDelete">Delete</button>
    </template>
  </BaseDialog>
</template>
