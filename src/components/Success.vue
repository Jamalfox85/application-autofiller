<script setup lang="ts">
import { ref } from 'vue'
import { usePersonalInfo } from '../composables/usePersonalInfo'

const { personalInfo, fullName, displayEmail, displayPhone, loadPersonalInfo, savePersonalInfo } =
  usePersonalInfo()

const fieldsDetected = ref(0)
</script>
<template>
  <div class="success-view">
    <div class="success-card">
      <div class="success-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="24" fill="#10B981" />
          <path
            d="M18 24l6 6 12-12"
            stroke="white"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <h2 class="success-title">Form Successfully Filled</h2>
      <p class="success-message">
        Automation engine successfully identified and populated {{ fieldsDetected }} fields
      </p>
    </div>

    <div class="success-info">
      <h3>CANDIDATE PROFILE</h3>
      <div class="info-field">
        <label>FULL NAME</label>
        <div class="info-value">{{ fullName }}</div>
      </div>
      <div class="info-field">
        <label>EMAIL ADDRESS</label>
        <div class="info-value">{{ displayEmail }}</div>
      </div>
      <div class="info-field">
        <label>LINKEDIN URL</label>
        <div class="info-value">{{ personalInfo.linkedin || 'linkedin.com/in/johndoe-ux' }}</div>
      </div>
    </div>

    <button class="success-btn">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        />
      </svg>
      Auto-fill Successful
    </button>
  </div>
</template>
<style scoped lang="scss">
.success-view {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  .success-card {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    margin-bottom: 24px;
    .success-icon {
      margin: 0 auto 16px;
      width: 48px;
      height: 48px;
    }

    .success-title {
      font-size: 18px;
      font-weight: 600;
      color: #f0f6fc;
      margin: 0 0 8px 0;
    }

    .success-message {
      font-size: 13px;
      color: #a0aec0;
      line-height: 1.5;
      margin: 0;
    }
  }
  .success-info {
    margin-bottom: 20px;
    h3 {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #a0aec0;
      margin: 0 0 12px 0;
    }
    .info-field {
      margin-bottom: 16px;
      label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #3b82f6;
        margin-bottom: 6px;
        letter-spacing: 0.5px;
      }

      .info-value {
        background: #2d3748;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        color: #e2e8f0;
      }
    }
  }
  .success-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 20px;
    transition: all 0.2s;
    &:hover {
      background: #059669;
    }
  }
}
</style>
