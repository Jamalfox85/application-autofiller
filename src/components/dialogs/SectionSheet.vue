<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  subtitle?: string
  fullscreen?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const handleClose = () => emit('close')
</script>

<template>
  <Transition :name="fullscreen ? 'fs-sheet' : 'sheet'">
    <div
      v-if="show"
      class="section-sheet-overlay"
      :class="{ fullscreen }"
      @click.self="handleClose"
    >
      <div class="section-sheet" :class="{ fullscreen }">
        <div class="section-sheet-header">
          <div>
            <div class="section-sheet-title">{{ title }}</div>
            <div v-if="subtitle" class="section-sheet-subtitle">{{ subtitle }}</div>
          </div>
          <button class="section-sheet-close" @click="handleClose">×</button>
        </div>

        <div class="section-sheet-content">
          <slot />
        </div>

        <div v-if="$slots.footer" class="section-sheet-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style>
/* Bottom-sheet shell for the section editor — visually distinct from BaseDialog's
   centered overlay (still used by Custom Responses' nested create/edit/delete dialogs).
   Form-field styling (.form-group, .form-row, etc.) is inherited from dialogs.scss;
   only the accent color is overridden below to match this design's palette. */
.section-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 10, 0.72);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.section-sheet {
  width: 100%;
  max-height: 92%;
  background: #16161a;
  border-top: 1px solid #2e2e36;
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
}

/* Full-screen variant — replaces the section list entirely rather than sheeting up over a
   dimmed backdrop, matching the Claude Design "Custom responses"/"Skills" screens. */
.section-sheet-overlay.fullscreen {
  align-items: stretch;
  background: none;
}

.section-sheet.fullscreen {
  max-height: none;
  height: 100%;
  background: #131316;
  border-top: none;
  border-radius: 0;
  box-shadow: none;
}

.section-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
  gap: 10px;
}

.section-sheet-title {
  font-size: 13px;
  font-weight: 600;
  color: #ebebee;
}

.section-sheet-subtitle {
  font-size: 11px;
  color: #7c7c86;
  margin-top: 2px;
}

.section-sheet-close {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.section-sheet-close:hover {
  color: #ebebee;
  border-color: #47475a;
}

.section-sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  min-height: 0;
  color: #ebebee;
}

.section-sheet-footer {
  display: flex;
  gap: 8px;
  padding: 11px 14px;
  border-top: 1px solid #22222a;
  flex-shrink: 0;
}

/* Accent overrides for form fields reused from dialogs.scss inside a section sheet */
.section-sheet-content .form-group input:focus,
.section-sheet-content .form-group select:focus,
.section-sheet-content .form-group textarea:focus,
.section-sheet-content input[type='month']:focus {
  border-color: #7c3aed !important;
  box-shadow: none !important;
}

.section-sheet-content .btn-primary-dialog {
  background: #7c3aed !important;
}

.section-sheet-content .btn-primary-dialog:hover {
  background: #8b5cf6 !important;
  box-shadow: none !important;
}

.section-sheet-content .btn-add-small {
  background: #7c3aed !important;
}

.section-sheet-content .btn-add-small:hover {
  background: #8b5cf6 !important;
  box-shadow: none !important;
}

.section-sheet-content .education-number {
  color: #a78bfa !important;
}

/* Footer buttons, matching the design's Cancel/Save treatment */
.section-sheet-footer .btn-secondary-dialog {
  flex: 1;
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
}

.section-sheet-footer .btn-secondary-dialog:hover {
  color: #ebebee;
}

.section-sheet-footer .btn-primary-dialog {
  flex: 1;
  border: none;
  background: #7c3aed;
  color: #fff;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 600;
}

.section-sheet-footer .btn-primary-dialog:hover {
  background: #8b5cf6;
  box-shadow: none;
}

.section-sheet-footer .btn-primary-dialog:disabled {
  background: #1a1a1f;
  color: #5c5c66;
  cursor: not-allowed;
}

/* Full-screen footer: Close/Cancel sits at its natural width instead of splitting evenly */
.section-sheet.fullscreen .section-sheet-footer .btn-secondary-dialog {
  flex: none;
  padding: 9px 14px;
}

/* Sheet transition — slides up, not the centered-dialog scale used by BaseDialog */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-enter-active .section-sheet,
.sheet-leave-active .section-sheet {
  transition: transform 0.25s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .section-sheet,
.sheet-leave-to .section-sheet {
  transform: translateY(100%);
}

.fs-sheet-enter-active,
.fs-sheet-leave-active {
  transition: opacity 0.2s ease;
}

.fs-sheet-enter-from,
.fs-sheet-leave-to {
  opacity: 0;
}
</style>
