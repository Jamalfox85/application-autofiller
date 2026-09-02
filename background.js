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

// ---------------------------------------------------------------------------
// Resume upload — runs here, not in the popup.
//
// The parse takes 5–10s and an extension popup is destroyed the moment it loses focus, which
// aborts any fetch it started (that's the "stuck on loading" bug). The popup base64-encodes
// the file and sends it here; this worker does the request and writes the outcome to
// chrome.storage.local["resumeUploadJob"], which the popup subscribes to (see
// src/composables/useResumeUpload.ts).
// ---------------------------------------------------------------------------
const RESUME_JOB_KEY = 'resumeUploadJob'

async function writeResumeJob(state) {
  await chrome.storage.local.set({
    [RESUME_JOB_KEY]: { ...state, updatedAt: Date.now() },
  })
}

function classifyResumeUploadError(status, apiMessage) {
  switch (status) {
    case 401:
      return { code: 'auth', message: 'Your session expired. Please sign in again.' }
    case 413:
      return { code: 'too_large', message: apiMessage || 'That file is too large — keep it under 10MB.' }
    case 415:
      return { code: 'bad_type', message: apiMessage || 'Please upload a PDF or DOCX file.' }
    case 422:
      return {
        code: 'unreadable',
        message: apiMessage || "We couldn't read this resume. Try a different file.",
      }
    case 502:
      return { code: 'upstream', message: 'The resume service is temporarily unavailable. Please try again shortly.' }
    case 503:
      return { code: 'server', message: 'The resume service is temporarily unavailable. Please try again shortly.' }
    default:
      return {
        code: `http_${status}`,
        message: apiMessage || `Upload failed (${status}). Please try again.`,
      }
  }
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function handleResumeUpload({ url, token, fileName, fileType, fileBytesBase64 }) {
  await writeResumeJob({ phase: 'uploading', fileName })

  if (!token) {
    await writeResumeJob({
      phase: 'error',
      code: 'no_session',
      message: 'Please sign in again before uploading your resume.',
    })
    return
  }

  let res
  let rawBody = ''
  try {
    const form = new FormData()
    form.append(
      'file',
      new Blob([base64ToBytes(fileBytesBase64)], { type: fileType || 'application/octet-stream' }),
      fileName,
    )

    res = await fetch(url, {
      method: 'POST',
      // No Content-Type — FormData sets multipart/form-data + boundary.
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    rawBody = await res.text()
  } catch (err) {
    console.error('[resume-upload] request failed', err)
    await writeResumeJob({
      phase: 'error',
      code: 'network',
      message: 'Upload failed — check your connection and that the API is running, then try again.',
    })
    return
  }

  let body = null
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    // non-JSON body — leave `body` null, handled below
  }
  console.log('[resume-upload]', res.status, rawBody.slice(0, 2000))

  try {
    if (res.ok && body && body.success === true) {
      await writeResumeJob({
        phase: 'done',
        fileName,
        firstUpload: body.data ? body.data.first_upload ?? null : null,
        parsed: body.data ? body.data.parsed ?? null : null,
        storagePath: body.data ? body.data.storage_path ?? null : null,
      })
      return
    }

    const apiMessage = body && typeof body.error === 'string' ? body.error : ''
    const { code, message } = classifyResumeUploadError(res.status, apiMessage)
    await writeResumeJob({ phase: 'error', httpStatus: res.status, code, message, apiMessage })
  } catch (err) {
    console.error('[resume-upload] handling response failed', err)
    await writeResumeJob({
      phase: 'error',
      code: 'unexpected',
      message: 'Something went wrong reading the response. Please try again.',
    })
  }
}

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup()
    sendResponse({ success: true })
  }

  if (request.action === 'uploadResume') {
    // Detached on purpose — the in-flight fetch keeps the worker alive; the popup watches
    // chrome.storage.local for the result rather than waiting on this response.
    handleResumeUpload(request)
    sendResponse({ started: true })
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
