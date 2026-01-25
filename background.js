// Background service worker - handles extension lifecycle and events

// Installation event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default storage
    chrome.storage.local.set({
      personalInfo: {},
      savedResponses: [],
      stats: {
        installDate: new Date().toISOString(),
        totalAutofills: 0,
        totalResponsesUsed: 0,
      },
    })
  }

  if (details.reason === 'update') {
  }

  // Create context menus only if API is available
  try {
    if (chrome.contextMenus) {
      chrome.contextMenus.create({
        id: 'autofill-form',
        title: 'Autofill this form',
        contexts: ['editable'],
      })

      chrome.contextMenus.create({
        id: 'save-response',
        title: 'Save this response',
        contexts: ['selection'],
      })
    }
  } catch (err) {}
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
    sendResponse({ success: true })
  }

  if (request.action === 'trackResponseUsed') {
    // Track response usage
    chrome.storage.local.get('stats', (data) => {
      const stats = data.stats || { totalAutofills: 0, totalResponsesUsed: 0 }
      stats.totalResponsesUsed = (stats.totalResponsesUsed || 0) + 1
      chrome.storage.local.set({ stats })
    })
    sendResponse({ success: true })
  }

  return true
})

// Context menu click handler - only add if contextMenus is available
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'autofill-form') {
      chrome.tabs.sendMessage(tab.id, { action: 'autofill' })
    }

    if (info.menuItemId === 'save-response' && info.selectionText) {
      // Open popup with pre-filled response text
      chrome.storage.local.set({
        pendingResponse: info.selectionText,
      })
      chrome.action.openPopup()
    }
  })
}

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

// Listen for tab updates to potentially show badge on job sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const jobSites = [
      'greenhouse',
      'workday',
      'lever',
      'indeed',
      'linkedin',
      'apply',
      'careers',
      'jobs',
    ]
    const isJobSite = jobSites.some((site) => tab.url.toLowerCase().includes(site))

    if (isJobSite) {
      updateBadge('✓', '#667eea')
    }
  }
})
