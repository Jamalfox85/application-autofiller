<script setup lang="ts">
import { ref } from 'vue'
import type { PersonalInfo } from '../types/index.ts'
import { infoCards } from '@/utils/infocards.ts'
import { coloredIcon } from '@/utils/icons.ts'

const props = defineProps<{
  personalInfo: PersonalInfo
}>()
const emit = defineEmits<{
  openDialog: [dialogName: string]
}>()
</script>
<template>
  <div
    class="info-card"
    v-for="card in infoCards"
    @click="$emit('openDialog', card.dialog)"
    :key="card.title"
  >
    <div class="card-icon" :style="{ background: `${card.color}25` }">
      <span v-html="coloredIcon(card.icon, card.color)" alt="User Icon" class="icon" />
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ card.title }}</h3>
      <p class="card-description">{{ card.description }}</p>
    </div>
    <div class="card-icon-2">
      <span v-html="card.actionIcon" alt="Edit Icon" class="icon" />
    </div>
  </div>
</template>
<style lang="scss">
.info-card {
  display: flex;
  align-items: center;
  background: #1c2128;
  border: 0.5px solid #30363d;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
  }
}
.card-icon {
  width: 40px;
  height: 40px;
  background: #0d1117;
  border: 0.5px solid #30363d;
  border-radius: 8px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
  margin-bottom: 4px;
}
.card-description {
  color: #8b949e;
}
.card-icon-2 {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

// Modal Styles
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dialog {
  background: #1c2128;
  border: 0.5px solid #30363d;
  border-radius: 12px;
  width: 100%;
  max-width: 550px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
  flex-shrink: 0; /* Don't let header shrink */
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
  flex-shrink: 0; /* Don't let close button shrink */
}

.close-btn:hover {
  color: #e2e8f0;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-height: 0; /* Important for flex overflow */
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #2d3748;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0; /* Don't let footer shrink */
}

/* Form Styles */
.edit-profile-form {
  width: 100%;
  max-width: 100%; /* Prevent overflow */
}

.form-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #30363d;
}

.form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.form-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%; /* Explicit width */
}

.form-group {
  margin-bottom: 16px;
  min-width: 0; /* Allow grid items to shrink */
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.form-group input[type='text'],
.form-group input[type='number'],
.form-group input[type='email'],
.form-group input[type='tel'],
.form-group input[type='url'],
.form-group input[type='password'],
.form-group select {
  width: 100%;
  max-width: 100%; /* Prevent overflow */
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box; /* Critical! */
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4f7cff;
}

.form-group input::placeholder {
  color: #718096;
}

.form-group select {
  cursor: pointer;
}

.form-group select option {
  background: #0d1117;
  color: #e2e8f0;
}

/* Education Section */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
}

.btn-add-small {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-small:hover {
  background: #3baef6;
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.empty-education {
  text-align: center;
  padding: 24px;
  background: #2d3748;
  border-radius: 8px;
  border: 2px dashed #30363d;
}

.empty-education p {
  color: #a0aec0;
  font-size: 13px;
  margin: 0;
}

.education-item {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.education-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #30363d;
}

.education-number {
  font-size: 13px;
  font-weight: 600;
  color: #3b82f6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-remove-small {
  padding: 4px 10px;
  background: none;
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-remove-small:hover {
  background: #ef4444;
  color: white;
}

/* Footer Buttons */
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
  background: #30363d;
}

.btn-primary-dialog {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary-dialog:hover {
  background: #3baef6;
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.section-note {
  font-size: 12px;
  color: #a0aec0;
  margin: 0 0 16px 0;
  font-style: italic;
  line-height: 1.4;
}

.form-group textarea {
  width: 100%;
  max-width: 100%;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
}

.form-group textarea:focus {
  outline: none;
  border-color: #4f7cff;
}

.form-group textarea::placeholder {
  color: #718096;
}

input[type='month'] {
  width: 100%;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
  cursor: pointer;
  color-scheme: dark; /* makes the browser's native picker use dark mode */
}

input[type='month']:hover:not(:disabled) {
  border-color: #4f7cff;
}

input[type='month']:focus {
  outline: none;
  border-color: #4f7cff;
  box-shadow: 0 0 0 3px rgba(79, 124, 255, 0.15);
}

input[type='month']:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

input[type='month']::-webkit-calendar-picker-indicator {
  filter: invert(0.6);
  cursor: pointer;
  transition: filter 0.2s;
}

input[type='month']:hover:not(:disabled)::-webkit-calendar-picker-indicator {
  filter: invert(0.9);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #e2e8f0;
}

.checkbox-label input[type='checkbox'] {
  width: auto;
  cursor: pointer;
}

.checkbox-label span {
  user-select: none;
}

/* Tags styling */
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
  min-height: 32px;
}

/* Override Naive UI NTag styles */
:deep(.n-tag) {
  background: #30363d !important;
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
  background: #0d1117 !important;
  border: 1px solid #30363d !important;
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
  border-color: #30363d !important;
}

:deep(.n-input.n-input--focus) {
  border-color: #4f7cff !important;
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

:deep(.n-input) {
  --n-color: #0d1117 !important;
  --n-color-focus: #0d1117 !important;
  --n-border: 1px solid #30363d !important;
  --n-border-hover: 1px solid #4f7cff !important;
  --n-border-focus: 1px solid #4f7cff !important;
  --n-text-color: #e2e8f0 !important;
  --n-placeholder-color: #718096 !important;
  --n-box-shadow-focus: 0 0 0 3px rgba(79, 124, 255, 0.15) !important;
  --n-caret-color: #4f7cff !important;
}

:deep(.n-tag) {
  --n-color: #30363d !important;
  --n-text-color: #e2e8f0 !important;
  --n-border: none !important;
  --n-close-icon-color: #8b949e !important;
  --n-close-icon-color-hover: #ef4444 !important;
  --n-close-color-hover: transparent !important;
  --n-close-color-pressed: transparent !important;
  --n-border-radius: 12px !important;
}
</style>
