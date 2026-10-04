<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { usePersonalInfo } from './composables/usePersonalInfo'
import { getUserIdOrNull } from './lib/sync/shared'
import { migrateLocalDataToSupabase } from './lib/sync/migrateLocal'
import { useNotification } from './composables/useNotification'
import { useFillHistory } from './composables/useFillHistory'
import { useAuth } from './composables/useAuth'
import { getSiteLabel } from '@/utils/jobSitePatterns.ts'
import { trackFillContract } from '@/services/fillTelemetry'
import { supabaseConfigError } from '@/lib/supabase'
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
import PaywallDialog from './components/PaywallDialog.vue'
import ProFeatures from './components/ProFeatures.vue'
import { fetchBillingState, openProCheckout, type BillingState } from '@/services/billing/client'
import { rememberActiveProfile } from '@/services/billing/profileRoster'
import {
  WORKDAY_ACCOUNT_NOTICE_KEY,
  parseWorkdayAccountNotice,
} from '@/utils/siteRules/workdayAccountNotice.ts'
import {
  ICIMS_ACCOUNT_NOTICE_KEY,
  parseIcimsAccountNotice,
} from '@/utils/siteRules/icimsAccountNotice.ts'
import { isIcimsCandidateHost } from '@/utils/siteRules/icimsAccount.ts'

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
const billing = ref<BillingState | null>(null)
const paywall = ref<{
  mode: 'soft' | 'hard' | 'resume_ai' | 'multi_profile'
  fillCount?: number
  fillsRemaining?: number
  ats?: string
} | null>(null)

const refreshBilling = async () => {
  billing.value = await fetchBillingState()
}

// Pro already has unlimited fills. The home-screen Upgrade button is only for
// free accounts, matching the Pro rows that open features instead of checkout.
const showUpgrade = computed(() => billing.value != null && !billing.value.isPro)
const upgradeBusy = ref(false)

const startUpgrade = async () => {
  if (upgradeBusy.value || !showUpgrade.value) return
  upgradeBusy.value = true
  try {
    const opened = await openProCheckout({
      plan: 'monthly',
      source: 'popup',
      fillCount: billing.value?.fillCount ?? null,
      atsSite: null,
    })
    if (!opened.ok) {
      showNotification(
        opened.error === 'extensionpay_not_configured'
          ? 'Checkout needs VITE_EXTENSIONPAY_EXTENSION_ID in this build.'
          : 'Couldn’t open checkout. Try again.',
        'error',
      )
    }
  } finally {
    upgradeBusy.value = false
  }
}

const openPaywall = (
  mode: 'soft' | 'hard' | 'resume_ai' | 'multi_profile',
  extra?: { fillCount?: number; fillsRemaining?: number; ats?: string },
) => {
  paywall.value = { mode, ...extra }
}

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

const workdayAccountAttention = ref('')
const icimsAccountAttention = ref('')
let presentedWorkdayNoticeAt = -1
let presentedIcimsNoticeAt = -1
let workdayNoticeQueue: Promise<void> = Promise.resolve()
let icimsNoticeQueue: Promise<void> = Promise.resolve()

const applicationAccountAttention = computed(() =>
  [workdayAccountAttention.value, icimsAccountAttention.value].filter((message) => message).join(' '),
)

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
    let host = ''
    try {
      host = tab.url ? new URL(tab.url).hostname : ''
    } catch {
      host = ''
    }
    // iCIMS keeps the application in a frame. Ask that frame directly so the
    // outer shell's hidden inputs are not the autofill result.
    const response = isIcimsCandidateHost(host)
      ? await chrome.runtime.sendMessage({ action: 'autofillIcimsTab', tabId: tab.id })
      : await chrome.tabs.sendMessage(tab.id, { action: 'autofill', surface: 'popup' })

    if (response?.code === 'hard_cap' || response?.paywall === 'hard') {
      autofillState.value = 'idle'
      openPaywall('hard', response)
      await refreshBilling()
      return
    }

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
      await refreshBilling()
      if (response.paywall === 'soft') openPaywall('soft', response)

      setTimeout(() => {
        autofillState.value = 'idle'
      }, 3200)
    } else {
      autofillState.value = 'idle'
      showNotification(response?.message || 'No available fields found to autofill', 'error')
    }
  } catch (error) {
    autofillState.value = 'idle'
    showNotification('Unable to autofill this page', 'error')

    let jobSite: string | undefined
    let pageHref: string | undefined
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      pageHref = tab?.url
      jobSite = pageHref ? new URL(pageHref).hostname : undefined
    } catch {
      // Tab URL can be unavailable on chrome:// and similar pages.
    }
    const fillContext = { hostname: jobSite || '', href: pageHref }
    await trackFillContract('autofill_attempted', fillContext)
    await trackFillContract('autofill_failed', {
      ...fillContext,
      failureReason: 'page_unreachable',
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
  void rememberActiveProfile(profile)
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
  if (key === 'applicationAccount') {
    workdayAccountAttention.value = ''
    icimsAccountAttention.value = ''
  }
}

// Content script writes WORKDAY_ACCOUNT_NOTICE_KEY when a Workday page needs a candidate
// account and the vault has no Workday login. Show the popup banner, and once the profile
// is loaded open Application Accounts so the user can fix it. Signed-out opens keep the
// stored notice until sign-in.
const presentWorkdayAccountNotice = (openAccounts: boolean) => {
  const run = workdayNoticeQueue.then(() => presentWorkdayAccountNoticeOnce(openAccounts))
  workdayNoticeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

const presentWorkdayAccountNoticeOnce = async (openAccounts: boolean) => {
  let stored: Record<string, unknown>
  try {
    stored = await chrome.storage.local.get(WORKDAY_ACCOUNT_NOTICE_KEY)
  } catch {
    return
  }
  const notice = parseWorkdayAccountNotice(stored[WORKDAY_ACCOUNT_NOTICE_KEY])
  if (!notice) return

  if (presentedWorkdayNoticeAt !== notice.at) {
    presentedWorkdayNoticeAt = notice.at
    showNotification(notice.message, 'warning')
  }

  if (!openAccounts || authStatus.value !== 'signed-in') return

  workdayAccountAttention.value = notice.message
  openDialog('applicationAccount')
  try {
    await chrome.action.setBadgeText({ text: '' })
  } catch (error) {
    console.error('Failed to clear Workday account badge', error)
  }
  try {
    await chrome.storage.local.remove(WORKDAY_ACCOUNT_NOTICE_KEY)
  } catch (error) {
    console.error('Failed to clear Workday account notice', error)
  }
}

const onWorkdayNoticeStored = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => {
  if (areaName !== 'local' || !changes[WORKDAY_ACCOUNT_NOTICE_KEY]?.newValue) return
  void presentWorkdayAccountNotice(authStatus.value === 'signed-in')
}

// Content script writes ICIMS_ACCOUNT_NOTICE_KEY when an iCIMS login/create-account page
// needs a candidate login and the vault has no iCIMS account. Same sheet and badge path
// as Workday, with its own storage key so the two notices do not clobber each other.
const presentIcimsAccountNotice = (openAccounts: boolean) => {
  const run = icimsNoticeQueue.then(() => presentIcimsAccountNoticeOnce(openAccounts))
  icimsNoticeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

const presentIcimsAccountNoticeOnce = async (openAccounts: boolean) => {
  let stored: Record<string, unknown>
  try {
    stored = await chrome.storage.local.get(ICIMS_ACCOUNT_NOTICE_KEY)
  } catch {
    return
  }
  const notice = parseIcimsAccountNotice(stored[ICIMS_ACCOUNT_NOTICE_KEY])
  if (!notice) return

  if (presentedIcimsNoticeAt !== notice.at) {
    presentedIcimsNoticeAt = notice.at
    showNotification(notice.message, 'warning')
  }

  if (!openAccounts || authStatus.value !== 'signed-in') return

  icimsAccountAttention.value = notice.message
  openDialog('applicationAccount')
  try {
    await chrome.action.setBadgeText({ text: '' })
  } catch (error) {
    console.error('Failed to clear iCIMS account badge', error)
  }
  try {
    await chrome.storage.local.remove(ICIMS_ACCOUNT_NOTICE_KEY)
  } catch (error) {
    console.error('Failed to clear iCIMS account notice', error)
  }
}

const onIcimsNoticeStored = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => {
  if (areaName !== 'local' || !changes[ICIMS_ACCOUNT_NOTICE_KEY]?.newValue) return
  void presentIcimsAccountNotice(authStatus.value === 'signed-in')
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
  await refreshBilling()
  if (activeView.value === 'main') {
    await detectApplication()
  }
  await presentWorkdayAccountNotice(true)
  await presentIcimsAccountNotice(true)
}

// Lifecycle
const onPersonalInfoStored = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => {
  if (areaName !== 'local' || !changes.personalInfo?.newValue) return
  const next = changes.personalInfo.newValue
  if (!next || typeof next !== 'object') return
  personalInfo.value = { ...personalInfo.value, ...(next as object) }
}

onMounted(async () => {
  chrome.storage.onChanged.addListener(onWorkdayNoticeStored)
  chrome.storage.onChanged.addListener(onIcimsNoticeStored)
  chrome.storage.onChanged.addListener(onPersonalInfoStored)
  if (supabaseConfigError) return
  await initAuth()
  if (authStatus.value === 'signed-in') {
    await loadAppState()
  } else if (authStatus.value === 'signed-out') {
    await presentWorkdayAccountNotice(false)
    await presentIcimsAccountNotice(false)
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

    <div v-if="supabaseConfigError" class="config-error">
      <img class="logo-mark" src="/assets/logo/gofillr-icon-small.svg" alt="" width="36" height="36" />
      <h1 class="config-error-title">GoFillr needs a rebuild</h1>
      <p class="config-error-body">{{ supabaseConfigError }}</p>
    </div>

    <div v-else-if="authStatus === 'loading'" class="auth-loading">
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
        <div class="fill-actions-row">
          <button
            class="autofill-btn"
            :disabled="!detection.detected || autofillState !== 'idle'"
            @click="autofillCurrentPage"
          >
            <span v-if="autofillState === 'idle'">Auto-fill application</span>
            <span v-else-if="autofillState === 'filling'">Filling fields…</span>
            <span v-else>Filled {{ lastFillCount?.filled }} of {{ lastFillCount?.total }} fields</span>
          </button>
          <button v-if="showUpgrade" class="upgrade-btn" type="button" @click="startUpgrade">
            Upgrade
          </button>
        </div>
        <button v-if="!detection.detected" class="scan-btn" @click="scanCurrentPageManually">
          Scan this page manually
        </button>
      </div>

      <button class="history-btn" type="button" @click="activeView = 'history'">History</button>

      <AutoDetectSwitch class="section" />

      <p v-if="billing && !billing.isPro" class="quota-note">
        {{ billing.fillCount }} of 25 free fills this week
      </p>

      <div class="section-header-row">
        <span class="section-header-label">Pro</span>
      </div>
      <ProFeatures :isPro="billing?.isPro === true" @upgrade="openPaywall('resume_ai')" />

      <div class="section-header-row">
        <span class="section-header-label">Your information</span>
      </div>
      <DataVault :personalInfo="personalInfo" @openDialog="openDialog" />
    </div>

    <HistoryView v-else-if="activeView === 'history'" @back="activeView = 'main'" />

    <footer v-if="activeView === 'main'" class="footer">
      <template v-if="detection.detected">
        <span class="footer-note">{{ lastFillLabel }}</span>
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
      :attention-message="applicationAccountAttention"
      @close="closeDialog('applicationAccount')"
      @save="saveProfile"
    />

    <PaywallDialog
      v-if="paywall"
      :mode="paywall.mode"
      :fill-count="paywall.fillCount"
      :fills-remaining="paywall.fillsRemaining"
      :ats="paywall.ats"
      @close="paywall = null"
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
  position: relative;
}
.quota-note {
  margin: 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #8f8f99;
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
.config-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 24px;
  .logo-mark {
    width: 36px;
    height: 36px;
    display: block;
    margin-bottom: 4px;
  }
}
.config-error-title {
  font-size: 15px;
  font-weight: 600;
  color: #ebebee;
  margin: 0;
  letter-spacing: -0.01em;
}
.config-error-body {
  font-size: 12px;
  color: #8f8f99;
  line-height: 1.5;
  margin: 0;
  max-width: 300px;
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

.fill-actions-row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;
}

.autofill-btn {
  flex: 1;
  min-width: 0;
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

.upgrade-btn {
  flex: 0 0 auto;
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
  white-space: nowrap;
  transition: background 0.15s ease;
  &:hover {
    background: #8b5cf6;
  }
  &:active {
    background: #6d28d9;
  }
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

.history-btn {
  width: 100%;
  border: 1px solid #2e2e36;
  border-radius: 9px;
  background: #17171b;
  color: #ebebee;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px;
  cursor: pointer;
  &:hover {
    background: #1d1d23;
    border-color: #47475a;
  }
  &:active {
    background: #141418;
  }
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
