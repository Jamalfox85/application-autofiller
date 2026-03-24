<script setup lang="ts">
import { ref, onMounted, computed, Ref, watch } from 'vue'
import { Linkedin, Globe, Github, Phone, Mail } from 'lucide-vue-next'
import { usePersonalInfo } from './composables/usePersonalInfo'
import { useNotification } from './composables/useNotification'
import Login from './components/Login.vue'
import Profile from './components/Profile.vue'
import AutoDetectSwitch from './components/AutoDetectSwitch.vue'
import Success from './components/Success.vue'

// Composables
const { loadPersonalInfo } = usePersonalInfo()

const { notification, showNotification } = useNotification()

// State
const activeView = ref<'main' | 'success'>('main')
const isAuthenticated = ref(false)
const showUpgradeModal = ref(false)

const fieldsDetected = ref(0)

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

const openLink = (url: string) => {
  chrome.tabs.create({ url })
}

// Lifecycle
onMounted(async () => {
  //   await checkAuth()

  //   // Listen for auth changes
  //   supabase.auth.onAuthStateChange((event, session) => {
  //     isAuthenticated.value = !!session
  //   })

  await loadPersonalInfo()
})

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
</script>

<template>
  <!-- <Login v-if="!isAuthenticated" @authenticated="checkAuth" /> -->
  <div class="container">
    <!-- Unauthenticated -->
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <img src="./assets/images/logo.png" width="40px" />
        <h1>Fillr</h1>
      </div>
    </header>

    <!-- Main View -->
    <div v-if="activeView === 'main'" class="content">
      <AutoDetectSwitch />
      <Profile />
    </div>

    <Success v-else-if="activeView === 'success'" />

    <div class="autofill-bttn-container">
      <button class="autofill-btn" @click="autofillCurrentPage">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
          />
        </svg>
        Auto-fill Current Page
      </button>
      <!-- <button @click="handleLogout">Logout</button> -->
    </div>

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
  </div>
</template>

<style lang="scss">
* {
  box-sizing: border-box;
}

.container {
  width: 400px;
  background: #1a202c;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
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
        color: #f7fafc;
        margin: 0;
      }
    }
  }
  .content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
  }
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
  margin-bottom: 12px;
}

/* Autofill Button */
.autofill-bttn-container {
  padding: 0 20px;
  margin-bottom: 12px;
  .autofill-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    background: rgb(72, 9, 233);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 16px;
    transition: all 0.2s;
    &:hover {
      background: rgb(93, 37, 235);
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    }
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
