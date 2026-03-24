<script setup lang="ts">
import { ref } from 'vue'
import type { PersonalInfo } from '../types'

import { usePersonalInfo } from '../composables/usePersonalInfo'
import { useNotification } from '../composables/useNotification'

const { personalInfo, fullName, displayEmail, displayPhone, loadPersonalInfo, savePersonalInfo } =
  usePersonalInfo()
const { notification, showNotification } = useNotification()

const showEditProfileDialog = ref(false)

const handleSaveProfile = async (updatedProfile: PersonalInfo) => {
  await savePersonalInfo(updatedProfile)
  showEditProfileDialog.value = false
  showNotification('Profile updated!')
}
</script>

<template>
  <div class="section">
    <h3 class="section-title">PROFILE</h3>
    <div class="profile-card">
      <div class="profile-info">
        <div>
          <h2 class="profile-name">{{ fullName }}</h2>
          <div class="profile-details">
            <div class="primary-details">
              <div class="detail-group" v-if="displayEmail">
                <Mail :size="14" />
                <p class="">{{ displayEmail }}</p>
              </div>
              <div class="detail-group" v-if="displayPhone">
                <Phone :size="14" />
                <p class="">{{ displayPhone }}</p>
              </div>
            </div>
          </div>
          <button class="edit-btn" @click="showEditProfileDialog = true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path
                d="M0 11.083V14h2.917l8.6-8.6-2.917-2.917-8.6 8.6zM13.733 2.483a.774.774 0 000-1.096L12.613.267a.774.774 0 00-1.096 0l-.88.88 2.917 2.916.88-.88z"
              />
            </svg>
            Edit Profile
          </button>
          <EditProfileDialog
            :show="showEditProfileDialog"
            :personal-info="personalInfo"
            @close="showEditProfileDialog = false"
            @save="handleSaveProfile"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.profile-card {
  background: #2d3748;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  .profile-info {
    display: flex;
    justify-content: space-between;
    align-items: start;
    .profile-name {
      font-size: 18px;
      font-weight: 600;
      color: #f7fafc;
      margin: 0 0 4px 0;
    }
    .profile-details {
      margin-top: 8px;
      margin-bottom: 1em;
      .detail-group {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
        color: #a0aec0;
        font-size: 13px;
        * {
          margin-right: 2px;
        }
      }
      .primary-details {
        margin-bottom: 1em;
        .detail-group {
          color: #e2e8f0;
          font-weight: 500;
        }
      }
    }
    .edit-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: #59c9a5;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      margin-top: 8px;
      transition: opacity 0.2s;
      &:hover {
        opacity: 0.8;
      }
    }
  }
}
</style>
