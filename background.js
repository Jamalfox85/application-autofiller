// Background service worker - handles extension lifecycle and events

// Mixpanel tracking for the service-worker context. This can't use the mixpanel-browser
// SDK (it needs `document`/`window`, which service workers don't have) so it posts to the
// HTTP Track API directly — see src/services/mixpanelHttp.ts for the same approach used by
// content scripts, src/services/mixpanel.ts for the SDK-based path used by the popup, and
// src/services/mixpanelIdentity.ts for the shared distinct_id this mirrors (background.js
// isn't bundled by Vite, so it can't import either module).
const MIXPANEL_TOKEN = '631d1b855c22a921118ebbe7bdcafedb'
const MIXPANEL_DISTINCT_ID_KEY = 'mixpanelDistinctId'

async function getOrCreateMixpanelDistinctId() {
  const existing = await chrome.storage.local.get(MIXPANEL_DISTINCT_ID_KEY)
  if (existing[MIXPANEL_DISTINCT_ID_KEY]) {
    return existing[MIXPANEL_DISTINCT_ID_KEY]
  }
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [MIXPANEL_DISTINCT_ID_KEY]: id })
  return id
}

function mixpanelSuperProperties() {
  return {
    platform: 'chrome_extension',
    app_version: chrome.runtime.getManifest().version,
  }
}

async function trackMixpanelEvent(eventName, properties) {
  try {
    const distinctId = await getOrCreateMixpanelDistinctId()
    const cleanProperties = Object.fromEntries(
      Object.entries(properties || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    )

    await fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify([
        {
          event: eventName,
          properties: {
            token: MIXPANEL_TOKEN,
            distinct_id: distinctId,
            time: Math.floor(Date.now() / 1000),
            $insert_id: crypto.randomUUID(),
            ...mixpanelSuperProperties(),
            ...cleanProperties,
          },
        },
      ]),
    })
  } catch (error) {
    console.error('Mixpanel track error:', error)
  }
}

async function getInstallSource() {
  try {
    const info = await chrome.management.getSelf()
    switch (info.installType) {
      case 'normal':
        return 'chrome_web_store'
      case 'sideload':
        return 'direct_link'
      case 'development':
        return 'unpacked'
      case 'admin':
        return 'admin_policy'
      default:
        return info.installType || 'chrome_web_store'
    }
  } catch {
    return 'chrome_web_store'
  }
}

// Installation event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default storage
    chrome.storage.local.set({
      personalInfo: {},
      stats: {
        installDate: new Date().toISOString(),
        totalAutofills: 0,
      },
    })

    getInstallSource().then((installSource) => {
      trackMixpanelEvent('extension_installed', {
        install_source: installSource,
        language: self.navigator?.language,
        name_of_install_user_type: 'new',
        // utm_campaign omitted — Chrome does not expose campaign params to the extension
        // at install time without a landing-page handoff.
      })
    })
  }
})

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup()
    sendResponse({ success: true })
  }

  if (request.action === 'trackAutofill') {
    // Track usage statistics
    chrome.storage.local.get('stats', (data) => {
      const stats = data.stats || { totalAutofills: 0, totalResponsesUsed: 0 }
      stats.totalAutofills = (stats.totalAutofills || 0) + 1
      chrome.storage.local.set({ stats })
    })

    // Append a fill-history entry, pruning anything older than 90 days
    const entry = request.entry
    if (entry) {
      chrome.storage.local.get('fillHistory', (data) => {
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
        const fillHistory = (data.fillHistory || []).filter((e) => e.timestamp >= ninetyDaysAgo)
        fillHistory.unshift({ id: Date.now(), ...entry })
        chrome.storage.local.set({ fillHistory })
      })
    }

    sendResponse({ success: true })
  }

  if (request.action === 'clearFillHistory') {
    chrome.storage.local.set({ fillHistory: [] })
    sendResponse({ success: true })
  }

  return true
})

// Keyboard shortcut handler (optional - can add keyboard shortcuts in manifest)
if (chrome.commands) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'autofill-page') {
      // Get active tab and trigger autofill
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'autofill' })
        }
      })
    }
  })
}

// Badge text to show status (optional)
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}
