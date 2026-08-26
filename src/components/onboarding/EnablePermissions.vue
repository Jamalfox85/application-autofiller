<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import AutoDetectSwitch from '../AutoDetectSwitch.vue'
import { trackEvent } from '@/services/mixpanel'

const emit = defineEmits<{
  finish: []
}>()

const reviewHighlightEnabled = ref(true)
const promptShownAt = Date.now()
let responseRecorded = false

const PROMPT_VARIANT = 'onboarding_step3_v1'

onMounted(async () => {
  const data = await chrome.storage.local.get('reviewHighlightEnabled')
  reviewHighlightEnabled.value = data.reviewHighlightEnabled ?? true
  window.addEventListener('pagehide', handlePageHide)
})

onUnmounted(() => {
  window.removeEventListener('pagehide', handlePageHide)
})

watch(reviewHighlightEnabled, async (value) => {
  await chrome.storage.local.set({ reviewHighlightEnabled: value })
})

// This screen is where the extension asks the user to turn on page-reading auto-detect —
// the closest thing to an in-product permission prompt this onboarding flow has. Response
// is captured once, from whatever state auto-detect is left in when the user moves on
// or closes the popup.
const recordPermissionResponse = async (response: 'granted' | 'denied' | 'closed') => {
  if (responseRecorded) return
  responseRecorded = true

  trackEvent('permissions_prompted', {
    permission_type: 'host_permissions',
    prompt_variant: PROMPT_VARIANT,
    response,
    time_to_response_seconds: (Date.now() - promptShownAt) / 1000,
  })
}

const handlePageHide = () => {
  void recordPermissionResponse('closed')
}

const handleFinish = async () => {
  const data = await chrome.storage.local.get('autoDetectEnabled')
  const autoDetectEnabled = data.autoDetectEnabled ?? true
  await recordPermissionResponse(autoDetectEnabled ? 'granted' : 'denied')
  emit('finish')
}
</script>

<template>
  <div class="onboarding-screen">
    <div class="onboarding-header">
      <div class="header-left">
        <span class="header-title">Turn on auto-detect</span>
      </div>
      <span class="step-label">Step 3 of 3</span>
    </div>

    <div class="explainer">
      GoFillr needs permission to read the page you're on so it can spot application forms. It
      only looks at pages you visit while it's on.
    </div>

    <div class="settings-list">
      <AutoDetectSwitch />

      <div class="info-row">
        <div class="info-copy">
          <div class="info-title">Keyboard shortcut</div>
          <div class="info-hint">Fill without opening the popup</div>
        </div>
        <span class="shortcut-key">⌘⇧F</span>
      </div>

      <div class="info-row">
        <div class="info-copy">
          <div class="info-title">Review before submitting</div>
          <div class="info-hint">Highlights filled fields so you can check them</div>
        </div>
        <button
          class="toggle-track"
          :class="{ active: reviewHighlightEnabled }"
          role="switch"
          :aria-checked="reviewHighlightEnabled"
          @click="reviewHighlightEnabled = !reviewHighlightEnabled"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="pin-card">
        <div class="pin-label">Pin GoFillr</div>
        <div class="pin-desc">
          Open your extensions menu and click the pin next to GoFillr to keep it in the toolbar.
        </div>
        <div class="pin-preview">
          <img class="pin-mark" src="/assets/logo/gofillr-icon-small.svg" alt="" width="18" height="18" />
          <span class="pin-name">GoFillr</span>
          <span class="pin-action">pin</span>
        </div>
      </div>
    </div>

    <div class="onboarding-footer">
      <button class="finish-btn" @click="handleFinish">Start filling applications</button>
    </div>
  </div>
</template>

<style scoped>
.onboarding-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.onboarding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-bottom: 1px solid #22222a;
  flex-shrink: 0;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.step-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #6f6f7a;
}

.explainer {
  padding: 18px 16px 12px;
  font-size: 12.5px;
  color: #8f8f99;
  line-height: 1.5;
  flex-shrink: 0;
}

.settings-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 10px;
  padding: 12px;
}

.info-copy {
  min-width: 0;
}

.info-title {
  font-size: 12.5px;
  font-weight: 500;
}

.info-hint {
  font-size: 11px;
  color: #8f8f99;
  margin-top: 3px;
  line-height: 1.45;
}

.shortcut-key {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #ebebee;
  border: 1px solid #33333d;
  background: #1e1e24;
  border-radius: 6px;
  padding: 4px 8px;
  flex-shrink: 0;
}

.toggle-track {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 20px;
  border: 1px solid #33333d;
  background: #1e1e24;
  cursor: pointer;
  padding: 0;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.toggle-track.active {
  border-color: #7c3aed;
  background: #7c3aed;
}

.toggle-track:hover {
  border-color: #47475a;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: left 140ms ease;
}

.toggle-track.active .toggle-knob {
  left: 18px;
}

.pin-card {
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.pin-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #6f6f7a;
}

.pin-desc {
  font-size: 11.5px;
  color: #8f8f99;
  line-height: 1.5;
}

.pin-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #2b2b33;
  background: #101014;
  border-radius: 8px;
  padding: 8px 10px;
}

.pin-mark {
  width: 18px;
  height: 18px;
  display: block;
  flex-shrink: 0;
}

.pin-name {
  font-size: 11.5px;
  flex: 1;
}

.pin-action {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #a78bfa;
}

.onboarding-footer {
  border-top: 1px solid #22222a;
  padding: 11px 13px;
  flex-shrink: 0;
}

.finish-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: #7c3aed;
  color: #fff;
  border-radius: 8px;
  padding: 11px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.finish-btn:hover {
  background: #8b5cf6;
}
</style>
