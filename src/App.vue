<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

// Types
interface PersonalInfo {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  linkedin: string
  website: string
  resumeFile?: string
}

interface SavedResponse {
  id: number
  title: string
  text: string
  tags: string[]
  createdAt: string
}

// State
const activeView = ref<'main' | 'success'>('main')
const personalInfo = ref<PersonalInfo>({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  linkedin: '',
  website: '',
  resumeFile: '',
})

const savedResponses = ref<SavedResponse[]>([])
const autoDetectEnabled = ref(true)
const fieldsDetected = ref(0)
const platformDetected = ref('LINKEDIN')
const showMissingField = ref(false)

const notification = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error',
})

// Computed
const fullName = computed(() => {
  return `${personalInfo.value.firstName} ${personalInfo.value.lastName}`.trim() || 'John Doe'
})

const displayEmail = computed(() => {
  return personalInfo.value.email || 'john.doe@email.com'
})

const displayPhone = computed(() => {
  return personalInfo.value.phone || '+1 234 567 890'
})

// Methods
const loadPersonalInfo = async () => {
  const data = await chrome.storage.local.get('personalInfo')
  if (data.personalInfo) {
    personalInfo.value = { ...personalInfo.value, ...data.personalInfo }
  }
}

const savePersonalInfo = async () => {
  await chrome.storage.local.set({ personalInfo: personalInfo.value })
  showNotification('Profile updated!')
}

const autofillCurrentPage = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  chrome.tabs.sendMessage(tab.id!, { action: 'autofill' }, (response) => {
    if (chrome.runtime.lastError) {
      showNotification('Unable to autofill this page', 'error')
      return
    }

    if (response && response.success) {
      fieldsDetected.value = response.fieldsCount
      activeView.value = 'success'
      setTimeout(() => {
        activeView.value = 'main'
      }, 3000)
    } else {
      showNotification('No fields found to autofill', 'error')
    }
  })
}

const detectCurrentPlatform = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      const url = tabs[0].url.toLowerCase()
      if (url.includes('linkedin')) platformDetected.value = 'LINKEDIN'
      else if (url.includes('workday')) platformDetected.value = 'WORKDAY ACTIVE'
      else if (url.includes('greenhouse')) platformDetected.value = 'GREENHOUSE'
      else if (url.includes('lever')) platformDetected.value = 'LEVER'
      else platformDetected.value = 'DETECTED'

      // Random fields detected for demo
      fieldsDetected.value = Math.floor(Math.random() * 8) + 3
    }
  })
}

const openSettings = () => {
  // Could open a full settings page or show inline
  showNotification('Settings coming soon!')
}

const editProfile = () => {
  // Toggle edit mode or open full form
  showNotification('Click fields to edit')
}

const addPortfolioLink = () => {
  const link = prompt('Enter your portfolio URL:')
  if (link) {
    personalInfo.value.website = link
    savePersonalInfo()
    showMissingField.value = false
  }
}

const replaceResume = () => {
  showNotification('Resume upload coming soon!')
}

const shareWithFriend = () => {
  const shareText = 'Check out RapidApply - it autofills job applications instantly!'
  navigator.clipboard.writeText(shareText)
  showNotification('Share link copied!')
}

const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
  notification.value = { show: true, message, type }
  setTimeout(() => {
    notification.value.show = false
  }, 2000)
}

// Check for missing fields
const checkMissingFields = () => {
  showMissingField.value = !personalInfo.value.website
}

// Lifecycle
onMounted(async () => {
  console.log('ping')
  await loadPersonalInfo()
  detectCurrentPlatform()
  checkMissingFields()
})
</script>

<template>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#4F7CFF" opacity="0.4" />
        </svg>
        <h1>RapidApply</h1>
      </div>
      <div class="header-actions">
        <span class="platform-badge">{{ platformDetected }}</span>
        <button class="icon-btn" @click="openSettings">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Main View -->
    <div v-if="activeView === 'main'" class="content">
      <!-- Profile Card -->
      <div class="profile-card">
        <div class="profile-info">
          <div>
            <h2 class="profile-name">{{ fullName }}</h2>
            <p class="profile-email">{{ displayEmail }}</p>
            <p class="profile-phone">{{ displayPhone }}</p>
            <button class="edit-btn" @click="editProfile">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path
                  d="M0 11.083V14h2.917l8.6-8.6-2.917-2.917-8.6 8.6zM13.733 2.483a.774.774 0 000-1.096L12.613.267a.774.774 0 00-1.096 0l-.88.88 2.917 2.916.88-.88z"
                />
              </svg>
              Edit Profile
            </button>
          </div>
          <div class="profile-avatar">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="#2D3748" />
              <circle cx="24" cy="20" r="8" fill="#4F7CFF" />
              <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="#4F7CFF" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Autofill Button -->
      <button class="autofill-btn" @click="autofillCurrentPage">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
          />
        </svg>
        Auto-fill Current Page
      </button>

      <!-- Fields Detected -->
      <div class="fields-detected">
        <div class="detected-info">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#10B981">
            <circle cx="8" cy="8" r="8" fill="currentColor" />
            <path d="M6.5 9.5L5 8l-.7.7L6.5 11 12 5.5 11.3 4.8z" fill="#1F2937" />
          </svg>
          <span>{{ fieldsDetected }} fields detected</span>
        </div>
        <div class="auto-detect">
          <span>Auto-detect</span>
          <button
            class="toggle-btn"
            :class="{ active: autoDetectEnabled }"
            @click="autoDetectEnabled = !autoDetectEnabled"
          >
            <span class="toggle-slider"></span>
          </button>
        </div>
      </div>

      <!-- Resume Section -->
      <div class="section">
        <h3 class="section-title">RESUME</h3>
        <div class="resume-item">
          <div class="file-info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#4F7CFF">
              <path
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              />
            </svg>
            <span>John_Doc_CV.pdf</span>
          </div>
          <button class="replace-btn" @click="replaceResume">Replace</button>
        </div>
      </div>

      <!-- Missing Field Warning -->
      <div v-if="showMissingField" class="missing-field">
        <div class="missing-header">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="#F59E0B">
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            />
          </svg>
          <span class="missing-text">MISSING FIELD</span>
        </div>
        <div class="missing-content">
          <span>Portfolio Link</span>
          <button class="add-now-btn" @click="addPortfolioLink">Add Now</button>
        </div>
      </div>
    </div>

    <!-- Success View -->
    <div v-if="activeView === 'success'" class="success-view">
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
          Automation engine successfully identified and populated {{ fieldsDetected }} fields on
          {{ platformDetected }}.
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

      <div class="success-info">
        <h3>DOCUMENTS</h3>
        <div class="document-item">
          <div class="doc-info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#4F7CFF">
              <path
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              />
            </svg>
            <div>
              <div class="doc-name">John_Doe_Resume_2024.pdf</div>
              <div class="doc-status">Ready for auto-upload</div>
            </div>
          </div>
          <button class="remove-btn">×</button>
        </div>
      </div>

      <button class="success-btn" @click="activeView = 'main'">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          />
        </svg>
        Auto-fill Successful
      </button>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <button class="footer-link">Support</button>
      <button class="footer-link">Documentation</button>
      <span class="version">v1.2.4</span>
    </footer>

    <button class="share-btn" @click="shareWithFriend">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M13.5 3a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM13 7.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-8 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11.5 7.5L5 11"
        />
      </svg>
      Share with a Friend
    </button>

    <!-- Notification -->
    <Transition name="notification">
      <div v-if="notification.show" :class="['notification', notification.type]">
        {{ notification.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.container {
  width: 400px;
  background: #1a202c;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  min-height: 600px;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand h1 {
  font-size: 18px;
  font-weight: 700;
  color: #f7fafc;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.platform-badge {
  padding: 4px 12px;
  background: #10b981;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.icon-btn {
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.icon-btn:hover {
  color: #e2e8f0;
}

/* Content */
.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* Profile Card */
.profile-card {
  background: #2d3748;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.profile-info {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.profile-name {
  font-size: 18px;
  font-weight: 600;
  color: #f7fafc;
  margin: 0 0 4px 0;
}

.profile-email,
.profile-phone {
  font-size: 13px;
  color: #a0aec0;
  margin: 2px 0;
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-top: 8px;
  transition: opacity 0.2s;
}

.edit-btn:hover {
  opacity: 0.8;
}

.profile-avatar {
  flex-shrink: 0;
}

/* Autofill Button */
.autofill-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: #4f7cff;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 16px;
  transition: all 0.2s;
}

.autofill-btn:hover {
  background: #4169e1;
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
}

/* Fields Detected */
.fields-detected {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-radius: 8px;
  margin-bottom: 20px;
}

.detected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #e2e8f0;
}

.auto-detect {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #a0aec0;
}

.toggle-btn {
  width: 40px;
  height: 24px;
  background: #4a5568;
  border: none;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-btn.active {
  background: #4f7cff;
}

.toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-btn.active .toggle-slider {
  transform: translateX(16px);
}

/* Section */
.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #a0aec0;
  margin: 0 0 12px 0;
}

.resume-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-radius: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #e2e8f0;
}

.replace-btn {
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* Missing Field */
.missing-field {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.missing-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.missing-text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #f59e0b;
}

.missing-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #e2e8f0;
  font-size: 14px;
}

.add-now-btn {
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

/* Success View */
.success-view {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.success-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  margin-bottom: 24px;
}

.success-icon {
  margin: 0 auto 16px;
  width: 48px;
  height: 48px;
}

.success-title {
  font-size: 18px;
  font-weight: 600;
  color: #f7fafc;
  margin: 0 0 8px 0;
}

.success-message {
  font-size: 13px;
  color: #a0aec0;
  line-height: 1.5;
  margin: 0;
}

.success-info {
  margin-bottom: 20px;
}

.success-info h3 {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #a0aec0;
  margin: 0 0 12px 0;
}

.info-field {
  margin-bottom: 16px;
}

.info-field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #4f7cff;
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

.document-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #2d3748;
  border: 2px dashed #4a5568;
  border-radius: 8px;
}

.doc-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.doc-name {
  font-size: 14px;
  color: #e2e8f0;
  font-weight: 500;
}

.doc-status {
  font-size: 12px;
  color: #a0aec0;
}

.remove-btn {
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 20px;
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
}

.success-btn:hover {
  background: #059669;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid #2d3748;
}

.footer-link {
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.footer-link:hover {
  color: #e2e8f0;
}

.version {
  margin-left: auto;
  font-size: 12px;
  color: #4a5568;
}

.share-btn {
  width: calc(100% - 40px);
  margin: 0 20px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: #2d3748;
  color: #e2e8f0;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.share-btn:hover {
  background: #4a5568;
}

/* Notification */
.notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #10b981;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.notification.error {
  background: #ef4444;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
