<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { usePersonalInfo } from './composables/usePersonalInfo'
import { getUserIdOrNull } from './lib/sync/shared'
import { migrateLocalDataToSupabase } from './lib/sync/migrateLocal'
import { useNotification } from './composables/useNotification'
import { useFillHistory } from './composables/useFillHistory'
import { useAuth } from './composables/useAuth'
import { getSiteLabel } from '@/utils/jobSitePatterns.ts'
import { trackEvent } from '@/services/mixpanel'
import DataVault from './components/DataVault.vue'
import Welcome from './components/Welcome.vue'
import HistoryView from './components/HistoryView.vue'
import AutoDetectSwitch from './components/AutoDetectSwitch.vue'
import SignIn from './components/SignIn.vue'

import UpdatePersonalInfoDialog from './components/dialogs/UpdatePersonalInfoDialog.vue'
import UpdateLinksDialog from './components/dialogs/UpdateLinksDialog.vue'
import UpdateEducationDialog from './components/dialogs/UpdateEducationDialog.vue'
import UpdateExperienceDialog from './components/dialogs/UpdateExperienceDialog.vue'
import UpdateSkillsDialog from './components/dialogs/UpdateSkillsDialog.vue'
import UpdateEEODialog from './components/dialogs/UpdateEEODialog.vue'
import UpdateOtherInfoDialog from './components/dialogs/UpdateOtherInfoDialog.vue'
import CustomResponsesDialog from './components/dialogs/CustomResponsesDialog.vue'
import ApplicationAccountDialog from './components/dialogs/ApplicationAccountDialog.vue'

const NOTIFICATION_ICONS: Record<string, string> = {
  success: '✓',
  error: '!',
  warning: '▲',
  info: 'i',
}

// Composables
const { loadPersonalInfo, savePersonalInfo } = usePersonalInfo()
const { notification, showNotification } = useNotification()
const { fillHistory, loadFillHistory } = useFillHistory()
const { status: authStatus, isSigningIn, signInError, initAuth, signIn, signOut } = useAuth()

// State
const personalInfo = ref<any>({})
const activeView = ref<'main' | 'welcome' | 'history'>('welcome')
const autofillState = ref<'idle' | 'filling' | 'done'>('idle')
const lastFillCount = ref<{ filled: number; total: number } | null>(null)

const detection = ref<{ detected: boolean; siteLabel: string | null; fieldCount: number }>({
  detected: false,
  siteLabel: null,
  fieldCount: 0,
})

const dialogs: Record<string, any> = {
  personalInfo: ref(false),
  links: ref(false),
  education: ref(false),
  experience: ref(false),
  skills: ref(false),
  eeoInfo: ref(false),
  otherDetails: ref(false),
  customResponses: ref(false),
  applicationAccount: ref(false),
}

const lastFillLabel = computed(() => {
  const mostRecent = fillHistory.value[0]
  if (!mostRecent) return 'No fills yet'

  const minutesAgo = Math.round((Date.now() - mostRecent.timestamp) / 60000)
  const when =
    minutesAgo < 1
      ? 'just now'
      : minutesAgo < 60
        ? `${minutesAgo}m ago`
        : `${Math.round(minutesAgo / 60)}h ago`
  return `Last fill · ${mostRecent.site}, ${when}`
})

const recentFills = computed(() => fillHistory.value.slice(0, 3))

const formatRecentFillTime = (timestamp: number) => {
  const minutesAgo = Math.round((Date.now() - timestamp) / 60000)
  if (minutesAgo < 1) return 'just now'
  if (minutesAgo < 60) return `${minutesAgo}m ago`
  return `${Math.round(minutesAgo / 60)}h ago`
}

// Methods
const detectApplication = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectApplication' })
    detection.value = response
  } catch (error) {
    // No content script on this tab (e.g. chrome:// pages) — treat as not detected
    detection.value = { detected: false, siteLabel: null, fieldCount: 0 }
  }
}

const scanCurrentPageManually = async () => {
  await detectApplication()
  if (!detection.value.detected) {
    showNotification('No application form found on this page', 'error')
  }
}

const autofillCurrentPage = async () => {
  if (autofillState.value !== 'idle') return

  autofillState.value = 'filling'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'autofill' })

    if (response?.success && response.fieldsCount > 0) {
      lastFillCount.value = { filled: response.fieldsCount, total: response.totalCount ?? response.fieldsCount }
      autofillState.value = 'done'

      const site = tab.url ? `${getSiteLabel(new URL(tab.url).hostname)} · ${new URL(tab.url).hostname}` : 'Unknown site'
      await chrome.runtime.sendMessage({
        action: 'trackAutofill',
        entry: {
          role: response.roleGuess || 'Untitled application',
          site,
          filledCount: response.fieldsCount,
          totalCount: response.totalCount ?? response.fieldsCount,
          timestamp: Date.now(),
        },
      })
      await loadFillHistory()

      setTimeout(() => {
        autofillState.value = 'idle'
      }, 3200)
    } else {
      autofillState.value = 'idle'
      showNotification('No available fields found to autofill', 'error')
    }
  } catch (error) {
    autofillState.value = 'idle'
    showNotification('Unable to autofill this page', 'error')

    let jobSite: string | undefined
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      jobSite = tab?.url ? new URL(tab.url).hostname : undefined
    } catch {
      // Tab URL can be unavailable on chrome:// and similar pages.
    }
    trackEvent('autofill_blocked_or_failed', {
      failure_reason: 'unsupported_site',
      job_site: jobSite,
      failure_stage: 'detection',
      attempt_count_for_form: 1,
    })
  }
}

const handleOnboardingFinish = async (profile?: any) => {
  if (profile) {
    personalInfo.value = profile
    try {
      await savePersonalInfo(profile)
    } catch (error) {
      // Saved to the local mirror already — Supabase sync will retry on the next save/open.
      console.error('Profile sync to Supabase failed during onboarding', error)
    }
    showNotification('We pre-filled your profile from your resume — please review it', 'success')
  } else {
    // No reviewed profile handed back (user skipped, or the parse-wait timed out and the API
    // wrote the profile server-side) — pull whatever Supabase has now.
    personalInfo.value = await loadPersonalInfo()
  }
  activeView.value = 'main'
  await detectApplication()
}

const saveProfile = async (profile: any) => {
  personalInfo.value = profile
  try {
    await savePersonalInfo(profile)
    showNotification('Profile saved successfully', 'success')
  } catch (error) {
    console.error('Profile sync to Supabase failed', error)
    showNotification("Saved on this device — we'll sync it when you're back online", 'warning')
  }
}

const openDialog = (key: string) => {
  if (dialogs[key]) {
    dialogs[key].value = true
  }
}

const closeDialog = (key: string) => {
  if (dialogs[key]) {
    dialogs[key].value = false
  }
}

const handleSignOut = async () => {
  await signOut()
  activeView.value = 'welcome'
}

// Loads the account-gated app state — run once we know a signed-in session exists, whether
// that was already true on mount or the user just completed sign-in.
const loadAppState = async () => {
  // One-time lift of any pre-Supabase local data into the user's account. No-op after it has
  // run once (or if there was nothing local to move).
  const userId = await getUserIdOrNull()
  if (userId) {
    await migrateLocalDataToSupabase(userId)
  }

  personalInfo.value = await loadPersonalInfo()
  if (personalInfo.value.firstName && personalInfo.value.lastName) {
    activeView.value = 'main'
  }

  await loadFillHistory()
  if (activeView.value === 'main') {
    await detectApplication()
  }
}

// Lifecycle
onMounted(async () => {
  await initAuth()
  if (authStatus.value === 'signed-in') {
    await loadAppState()
  }
})

watch(authStatus, (next, previous) => {
  if (next === 'signed-in' && previous !== 'signed-in') {
    loadAppState()
  }
})
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="brand">
        <img class="logo-mark" src="/assets/logo/gofillr-icon-small.svg" alt="" width="20" height="20" />
        <span class="brand-name">GoFillr</span>
      </div>
      <button v-if="authStatus === 'signed-in'" class="signout-btn" @click="handleSignOut">Sign out</button>
    </header>

    <div v-if="authStatus === 'loading'" class="auth-loading">
      <div class="spinner"></div>
    </div>

    <SignIn
      v-else-if="authStatus === 'signed-out'"
      :loading="isSigningIn"
      :error="signInError"
      @signIn="signIn"
    />

    <Welcome
      v-else-if="activeView === 'welcome'"
      :personalInfo="personalInfo"
      @save="saveProfile"
      @finish="handleOnboardingFinish"
    />

    <div v-else-if="activeView === 'main'" class="content">
      <div class="status-card" :class="{ muted: !detection.detected }">
        <template v-if="detection.detected">
          <div class="status-row">
            <div class="status-left">
              <span class="status-dot"></span>
              <span class="status-site">{{ detection.siteLabel }}</span>
            </div>
            <span class="status-field-count">{{ detection.fieldCount }} fields</span>
          </div>
          <div class="status-detail">Job application detected on this page.</div>
        </template>
        <template v-else>
          <div class="status-row">
            <span class="status-dot muted"></span>
            <span class="status-site muted">No application form found</span>
          </div>
          <div class="status-detail">Open a job application and GoFillr will pick it up automatically.</div>
        </template>
      </div>

      <div class="fill-actions">
        <button
          class="autofill-btn"
          :disabled="!detection.detected || autofillState !== 'idle'"
          @click="autofillCurrentPage"
        >
          <span v-if="autofillState === 'idle'">Auto-fill application</span>
          <span v-else-if="autofillState === 'filling'">Filling fields…</span>
          <span v-else>Filled {{ lastFillCount?.filled }} of {{ lastFillCount?.total }} fields</span>
          <span v-if="autofillState === 'idle' && detection.detected" class="shortcut-badge">⌘⇧F</span>
        </button>
        <button v-if="!detection.detected" class="scan-btn" @click="scanCurrentPageManually">
          Scan this page manually
        </button>
      </div>

      <div v-if="!detection.detected && recentFills.length" class="recent-fills">
        <div class="section-header-row">
          <span class="section-header-label">Recent fills</span>
        </div>
        <button
          v-for="entry in recentFills"
          :key="entry.id"
          class="recent-fill-row"
          @click="activeView = 'history'"
        >
          <span class="recent-fill-role">{{ entry.role }}</span>
          <span class="recent-fill-meta">{{ entry.site }} · {{ formatRecentFillTime(entry.timestamp) }}</span>
        </button>
      </div>

      <AutoDetectSwitch class="section" />

      <div class="section-header-row">
        <span class="section-header-label">Your information</span>
      </div>
      <DataVault :personalInfo="personalInfo" @openDialog="openDialog" />
    </div>

    <HistoryView v-else-if="activeView === 'history'" @back="activeView = 'main'" />

    <footer v-if="activeView === 'main'" class="footer">
      <template v-if="detection.detected">
        <span class="footer-note">{{ lastFillLabel }}</span>
        <button class="footer-link" @click="activeView = 'history'">View history</button>
      </template>
      <template v-else>
        <span class="footer-note">Synced</span>
        <a class="footer-link" href="https://gofillr.com/help" target="_blank" rel="noopener noreferrer">Help</a>
      </template>
    </footer>

    <!-- Notification -->
    <Transition name="notification">
      <div v-if="notification.show" :class="['notification', notification.type]">
        <span class="notification-icon">{{ NOTIFICATION_ICONS[notification.type] }}</span>
        <span class="notification-text">{{ notification.message }}</span>
      </div>
    </Transition>

    <!-- Dialogs -->
    <UpdatePersonalInfoDialog
      :show="dialogs.personalInfo.value"
      :personalInfo="personalInfo"
      @close="closeDialog('personalInfo')"
      @save="saveProfile"
    />
    <UpdateLinksDialog
      :show="dialogs.links.value"
      :personalInfo="personalInfo"
      @close="closeDialog('links')"
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
    <CustomResponsesDialog
      :show="dialogs.customResponses.value"
      @close="closeDialog('customResponses')"
    />
    <ApplicationAccountDialog
      :show="dialogs.applicationAccount.value"
      :personalInfo="personalInfo"
      @close="closeDialog('applicationAccount')"
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
  background: #0c0c0e;
  color: #ebebee;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-mark {
    width: 20px;
    height: 20px;
    display: block;
  }
  .brand-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
}
.signout-btn {
  background: none;
  border: none;
  color: #8f8f99;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  padding: 0;
}
.signout-btn:hover {
  color: #ebebee;
}
.auth-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-loading .spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid #23272f;
  border-top-color: #7c3aed;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.content {
  flex: 1;
  padding: 13px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section {
  margin: 0;
}

.status-card {
  border: 1px solid #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
  border-radius: 10px;
  padding: 11px 12px;
  &.muted {
    border-color: #26262c;
    background: #17171b;
  }
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.status-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.18);
  flex-shrink: 0;
  &.muted {
    background: #4a4a55;
    box-shadow: none;
  }
}
.status-site {
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &.muted {
    color: #b9b9c2;
  }
}
.status-field-count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #8f8f99;
  flex-shrink: 0;
  white-space: nowrap;
}
.status-detail {
  font-size: 11.5px;
  color: #8f8f99;
  margin-top: 5px;
  line-height: 1.45;
}

.fill-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.autofill-btn {
  width: 100%;
  border: none;
  border-radius: 9px;
  background: #7c3aed;
  color: #fff;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s ease;
  &:hover:not(:disabled) {
    background: #8b5cf6;
  }
  &:active:not(:disabled) {
    background: #6d28d9;
  }
  &:disabled {
    background: #1a1a1f;
    border: 1px solid #26262c;
    color: #5c5c66;
    cursor: not-allowed;
  }
}

.shortcut-badge {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  opacity: 0.72;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  padding: 1px 4px;
}

.scan-btn {
  width: 100%;
  border: 1px solid #2e2e36;
  border-radius: 9px;
  background: #17171b;
  color: #b9b9c2;
  font-family: inherit;
  font-size: 12.5px;
  padding: 9px 14px;
  cursor: pointer;
  &:hover {
    color: #ebebee;
    border-color: #47475a;
  }
}

.recent-fills {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.recent-fill-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 8px;
  padding: 9px 11px;
  cursor: pointer;
  font-family: inherit;
  color: #ebebee;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.recent-fill-row:hover {
  background: #1d1d23;
  border-color: #33333d;
}

.recent-fill-role {
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.recent-fill-meta {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #7c7c86;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-header-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #6f6f7a;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 13px;
  border-top: 1px solid #22222a;
  flex-shrink: 0;
  background: #0c0c0e;
}

.footer-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.footer-link {
  background: none;
  border: none;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
}

.footer-link:hover {
  color: #c4b5fd;
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
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid;
  border-radius: 9px;
  padding: 11px 12px;
  box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  animation: slide-down 0.25s ease-out;
}

.notification-icon {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.notification-text {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
}

.notification.success {
  border-color: #24402f;
  background: #131c17;
}
.notification.success .notification-icon {
  background: #2c6b48;
  color: #dff0e6;
}
.notification.success .notification-text {
  color: #dff0e6;
}

.notification.error {
  border-color: #4a2727;
  background: #1c1414;
}
.notification.error .notification-icon {
  background: #7d3535;
  color: #f3dede;
}
.notification.error .notification-text {
  color: #f3dede;
}

.notification.warning {
  border-color: #3f3520;
  background: #1c1810;
}
.notification.warning .notification-icon {
  background: #7a5c22;
  color: #f6ead2;
}
.notification.warning .notification-text {
  color: #f6ead2;
}

.notification.info {
  border-color: #2b2440;
  background: #17161c;
}
.notification.info .notification-icon {
  background: #4c3a86;
  color: #e7defb;
}
.notification.info .notification-text {
  color: #ebe7f7;
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

/* Dialog open/close transition lives in src/assets/dialogs.scss (shared with BaseDialog) */
</style>
