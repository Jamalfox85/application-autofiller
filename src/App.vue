<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ICON_SETTINGS, ICON_HISTORY, ICON_WAND } from '@/utils/icons'
import { usePersonalInfo } from './composables/usePersonalInfo'
import { useSettings } from './composables/useSettings'
import { useNotification } from './composables/useNotification'
import StatBlocks from './components/StatBlocks.vue'
import DataVault from './components/DataVault.vue'
import Welcome from './components/Welcome.vue'
import Success from './components/Success.vue'

import SettingsDialog from './components/dialogs/SettingsDialog.vue'
import UpdatePersonalInfoDialog from './components/dialogs/UpdatePersonalInfoDialog.vue'
import UpdateSocialProfilesDialog from './components/dialogs/UpdateSocialProfilesDialog.vue'
import UpdateResumeDialog from './components/dialogs/UpdateResumeDialog.vue'
import UpdateEducationDialog from './components/dialogs/UpdateEducationDialog.vue'
import UpdateExperienceDialog from './components/dialogs/UpdateExperienceDialog.vue'
import UpdateSkillsDialog from './components/dialogs/UpdateSkillsDialog.vue'
import UpdateEEODialog from './components/dialogs/UpdateEEODialog.vue'
import UpdateOtherInfoDialog from './components/dialogs/UpdateOtherInfoDialog.vue'

// Composables
const { loadPersonalInfo, savePersonalInfo } = usePersonalInfo()
const { loadSettings } = useSettings()
const { notification, showNotification } = useNotification()

// State
const isAuthenticated = ref(false)
const personalInfo = ref<any>({})
const userSettings = ref<any>({})
const activeView = ref<'main' | 'success' | 'welcome'>('welcome')
const showUpgradeModal = ref(false)
const fieldsDetected = ref(0)

const dialogs: Record<string, any> = {
  settings: ref(false),
  personalInfo: ref(false),
  socialProfiles: ref(false),
  resume: ref(false),
  education: ref(false),
  experience: ref(false),
  skills: ref(false),
  eeoInfo: ref(false),
  otherDetails: ref(false),
}

// Methods
const autofillCurrentPage = async () => {
  try {
    // Check usage limits first
    // const usageResult = await api.incrementUsage('applications')

    // if (!usageResult.success) {
    //   showUpgradeModal.value = true
    //   return
    // }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) {
      showNotification('Unable to access this tab', 'error')
      return
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'autofill' })

    if (response?.success && response.fieldsCount > 0) {
      fieldsDetected.value = response.fieldsCount
      activeView.value = 'success'
      setTimeout(() => {
        activeView.value = 'main'
      }, 3000)
    } else {
      showNotification('No available fields found to autofill', 'error')
    }
  } catch (error) {
    showNotification('Unable to autofill this page', 'error')
  }
}

const openHistory = () => {
  showNotification('History page is coming soon!', 'info')
}

const openSettings = () => {
  showNotification('Settings page is coming soon!', 'info')
}

const openLink = (url: string) => {
  chrome.tabs.create({ url })
}

const setupProfileClicked = () => {
  dialogs.personalInfo.value = true
  activeView.value = 'main'
}

const saveProfile = (profile: any) => {
  personalInfo.value = profile
  savePersonalInfo(profile)
  showNotification('Profile saved successfully', 'success')
}

const openDialog = (key: string) => {
  if (dialogs[key]) {
    if (key == 'resume') {
      showNotification('Resume management is coming soon!', 'info')
      return
    }
    dialogs[key].value = true
  }
}

const closeDialog = (key: string) => {
  if (dialogs[key]) {
    dialogs[key].value = false
  }
}

// async function checkAuth() {
//   const {
//     data: { session },
//   } = await supabase.auth.getSession()
//   isAuthenticated.value = !!session
// }

// async function handleLogout() {
//   await supabase.auth.signOut()
//   isAuthenticated.value = false
// }

// Lifecycle
onMounted(async () => {
  //   await checkAuth()
  //   // Listen for auth changes
  //   supabase.auth.onAuthStateChange((event, session) => {
  //     isAuthenticated.value = !!session
  //   })

  personalInfo.value = await loadPersonalInfo()
  if (personalInfo.value.firstName && personalInfo.value.lastName) {
    activeView.value = 'main'
  }

  userSettings.value = await loadSettings()
})
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="brand">
        <img src="././assets/images/logo-transparent-white.png" alt="GoFillr Logo" class="logo" />
      </div>
      <div class="header-right">
        <!-- <span v-html="ICON_HISTORY" alt="History Icon" class="icon" @click="openHistory" /> -->
        <span v-html="ICON_SETTINGS" alt="Settings Icon" class="icon" @click="openSettings" />
      </div>

      <!-- <button @click="handleLogout">Logout</button> -->
    </header>

    <Welcome v-if="activeView === 'welcome'" @setupProfile="setupProfileClicked" />
    <div v-else-if="activeView === 'main'" class="content">
      <StatBlocks class="section" :personalInfo="personalInfo" />
      <div class="section">
        <button class="autofill-btn" @click="autofillCurrentPage">
          <div class="bttn-main-txt">
            <span v-html="ICON_WAND" alt="Clipboard Icon" class="icon" />
            Auto-fill Application
          </div>
          <div class="bttn-sub-txt" v-if="fieldsDetected > 0">
            <span>{{ fieldsDetected }} fields detected</span>
          </div>
        </button>
      </div>
      <h3 class="section-title">DATA VAULT</h3>
      <DataVault class="section" :personalInfo="personalInfo" @openDialog="openDialog" />
    </div>

    <Success v-else-if="activeView === 'success'" />

    <footer class="footer">
      <button class="footer-link" @click="openLink('https://www.gofillr.com/private-policy')">
        Private Policy
      </button>
      <button class="footer-link" @click="openLink('https://www.gofillr.com/support')">
        Support
      </button>
      <span class="version">v1.0.0</span>
    </footer>

    <!-- Notification -->
    <Transition name="notification">
      <div v-if="notification.show" :class="['notification', notification.type]">
        {{ notification.message }}
      </div>
    </Transition>

    <!-- Dialogs -->
    <SettingsDialog
      :show="dialogs.settings.value"
      :settings="userSettings"
      @close="closeDialog('settings')"
      @save="saveSettings"
    />
    <UpdatePersonalInfoDialog
      :show="dialogs.personalInfo.value"
      :personalInfo="personalInfo"
      @close="closeDialog('personalInfo')"
      @save="saveProfile"
    />
    <UpdateSocialProfilesDialog
      :show="dialogs.socialProfiles.value"
      :personalInfo="personalInfo"
      @close="closeDialog('socialProfiles')"
      @save="saveProfile"
    />
    <UpdateResumeDialog
      :show="dialogs.resume.value"
      :personalInfo="personalInfo"
      @close="closeDialog('resume')"
      @save="saveProfile"
    />
    <UpdateEducationDialog
      :show="dialogs.education.value"
      :personalInfo="personalInfo"
      @close="closeDialog('education')"
      @save="saveProfile"
    />
    <UpdateExperienceDialog
      :show="dialogs.experience.value"
      :personalInfo="personalInfo"
      @close="closeDialog('experience')"
      @save="saveProfile"
    />
    <UpdateSkillsDialog
      :show="dialogs.skills.value"
      :personalInfo="personalInfo"
      @close="closeDialog('skills')"
      @save="saveProfile"
    />
    <UpdateEEODialog
      :show="dialogs.eeoInfo.value"
      :personalInfo="personalInfo"
      @close="closeDialog('eeoInfo')"
      @save="saveProfile"
    />
    <UpdateOtherInfoDialog
      :show="dialogs.otherDetails.value"
      :personalInfo="personalInfo"
      @close="closeDialog('otherDetails')"
      @save="saveProfile"
    />
  </div>
</template>

<style lang="scss">
* {
  box-sizing: border-box;
}
.container {
  width: 400px;
  height: 600px;
  background: #0d1117;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    h1 {
      font-size: 18px;
      font-weight: 700;
      color: #f0f6fc;
    }
    .logo {
      height: 28px;
    }
  }
  .header-right {
    display: flex;
    .icon {
      height: 22px;
      width: 22px;
      margin-right: 12px;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        transform: translateY(-1px);
      }
    }
  }
}
.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
.icon svg {
  height: 20px;
  width: 20px;
}
.icon.primary svg {
  height: 28px;
  width: 28px;
}
.icon.save svg {
  margin-left: 8px;
  height: 24px;
  width: 24px;
  opacity: 0;
  transition: opacity 0.2s;
  &.active svg {
    opacity: 1;
    svg path {
      fill: rgb(93, 37, 235);
    }
  }
}

.section {
  margin-bottom: 20px;
}

.section-title,
.stat-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #a0aec0;
  margin: 0 0 12px 0;
  margin-bottom: 12px;
}

.autofill-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  background: #3b82f6;
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    background: #3baef6;
    box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    transform: translateY(-1px);
  }
  .bttn-main-txt {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bttn-sub-txt {
    font-size: 12px;
    color: #dbeafe;
  }
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

/* Notification */
@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 40px); /* 20px padding on each side */
  background: #10b981;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  animation: slide-down 0.25s ease-out;
}

.notification.error {
  background: #ef4444;
}
.notification.info {
  background: #3b82f6;
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

/* Dialog Transitions */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: scale(0.9) translateY(20px);
}
</style>
