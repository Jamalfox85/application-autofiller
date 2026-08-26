<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()

const handleClose = () => emit('close')
</script>

<template>
  <Transition name="fs-sheet">
    <div v-if="show" class="fs-sheet">
      <div class="fs-sheet-header">
        <div class="fs-sheet-header-left">
          <button class="fs-sheet-back" @click="handleClose">←</button>
          <span class="fs-sheet-title">{{ title }}</span>
        </div>
        <span class="fs-sheet-status"><slot name="status" /></span>
      </div>

      <div class="fs-sheet-content">
        <slot />
      </div>

      <div v-if="$slots.footer" class="fs-sheet-footer">
        <slot name="footer" />
      </div>
    </div>
  </Transition>
</template>

<style>
/* Full-screen section-editing shell — replaces the section list entirely rather than
   overlaying it as a bottom sheet (see SectionSheet.vue), matching the Claude Design
   "Personal details · editing" screen. Structural chrome lives here; field-level styling
   (.fs-group, .fs-field, etc.) is shared in dialogs.scss so every migrated section form
   gets it without duplicating per-component CSS. */
.fs-sheet {
  position: fixed;
  inset: 0;
  background: #131316;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.fs-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
  gap: 10px;
}

.fs-sheet-header-left {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.fs-sheet-back {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.fs-sheet-back:hover {
  color: #ebebee;
  border-color: #47475a;
}

.fs-sheet-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #ebebee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-sheet-status {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
  flex-shrink: 0;
  white-space: nowrap;
}

.fs-sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 16px;
  min-height: 0;
  color: #ebebee;
}

.fs-sheet-footer {
  display: flex;
  gap: 8px;
  padding: 11px 13px;
  border-top: 1px solid #22222a;
  background: #131316;
  flex-shrink: 0;
}

.fs-sheet-footer .btn-secondary-dialog {
  flex: none;
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 8px;
  padding: 9px 13px;
  font-size: 12.5px;
}

.fs-sheet-footer .btn-secondary-dialog:hover {
  color: #ebebee;
}

.fs-sheet-footer .btn-primary-dialog {
  flex: 1;
  border: none;
  background: #7c3aed;
  color: #fff;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 600;
}

.fs-sheet-footer .btn-primary-dialog:hover {
  background: #8b5cf6;
  box-shadow: none;
}

.fs-sheet-footer .btn-primary-dialog:disabled {
  background: #1a1a1f;
  color: #5c5c66;
  cursor: not-allowed;
}

.fs-sheet-enter-active,
.fs-sheet-leave-active {
  transition: opacity 0.18s ease;
}

.fs-sheet-enter-from,
.fs-sheet-leave-to {
  opacity: 0;
}
</style>
