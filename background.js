// Background service worker - handles extension lifecycle and events

// Shared with the popup and content script. copy-files emits the compiled module at
// this path; the worker is not part of the Vite bundle, so it imports the file directly.
import {
  INSTALL_SOURCE_STORAGE_KEY,
  attributionFromLanding,
  attributionFromTabUrls,
  attributionFromUrl,
  installSourceProperties,
  canEnrichInstallSource,
  isAttributionHost,
  mergeInstallSource,
} from './src/services/installAttribution.js'
import { handleBillingMessage, startExtensionPay } from './src/services/extensionPayWorker.js'
import { signInWithGoogleInWorker } from './src/services/googleSignInWorker.js'
import { persistUploadedResume } from './src/services/resumeVaultWorker.js'
import { deliverAutofillCommand } from './src/utils/contentScriptConnection.js'
import { deliverIcimsPageDropdown } from './src/utils/siteRules/icimsPageDropdownCommand.js'
import { handleMatchScoreMessage } from './src/services/matchScoreWorker.js'
import { deliverIcimsAutofill } from './src/utils/siteRules/icimsFrameAutofill.js'
import { loadSavedResumeForWorker } from './src/utils/siteRules/bamboohrResumeWorker.js'
import {
  calendarWeekKey,
  decideQuotaClaim,
  forgetQuotaClaim,
  quotaPageKey,
} from './src/services/billing/quotaPage.js'

startExtensionPay()

const FILL_QUOTA_CLAIMS_KEY = 'fillQuotaClaims'
const quotaClaimQueues = new Map()

function enqueueQuotaClaim(pageKey, task) {
  const previous = quotaClaimQueues.get(pageKey) || Promise.resolve()
  const run = previous.then(task, task)
  quotaClaimQueues.set(
    pageKey,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

// The pre-release local profile roster stored full profiles, including portal passwords.
// Profiles now live in Supabase; drop the key on every worker start.
chrome.storage.local.remove('profileRoster').catch(() => {})

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
    const installProps = installSourceProperties(await readInstallSource())
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
            ...installProps,
            ...cleanProperties,
          },
        },
      ]),
    })
  } catch (error) {
    console.error('Mixpanel track error:', error)
  }
}

function channelFromInstallType(installType) {
  switch (installType) {
    case 'normal':
      return 'chrome_web_store'
    case 'sideload':
      return 'direct_link'
    case 'development':
      return 'unpacked'
    case 'admin':
      return 'admin_policy'
    default:
      return installType || 'chrome_web_store'
  }
}

async function readManagementInfo() {
  try {
    return await chrome.management.getSelf()
  } catch {
    return null
  }
}

async function readInstallSource() {
  const data = await chrome.storage.local.get(INSTALL_SOURCE_STORAGE_KEY)
  return data[INSTALL_SOURCE_STORAGE_KEY] || {}
}

// Install-source writes share one queue so onInstalled and a landing-page message
// can't clobber each other's read-modify-write.
let installSourceQueue = Promise.resolve()

function enqueueInstallSource(task) {
  const run = installSourceQueue.then(task, task)
  installSourceQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function attributionFromOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({})
    return attributionFromTabUrls(tabs)
  } catch {
    return {}
  }
}

// onInstalled only reports reason. Campaign params, when they exist, are still on
// the Chrome Web Store listing tab or a gofillr.com landing tab, or on the
// extension update URL for sideloads. We never read arbitrary tab URLs.
async function handleInstall() {
  const info = await readManagementInfo()
  const channel = channelFromInstallType(info?.installType)
  const fromUpdateUrl = info?.updateUrl ? attributionFromUrl(info.updateUrl) : {}
  const fromTabs = await attributionFromOpenTabs()
  const fromWorker = attributionFromUrl(self.location?.href || '')

  let incoming = {}
  incoming = mergeInstallSource(incoming, fromTabs).record
  incoming = mergeInstallSource(incoming, fromUpdateUrl).record
  incoming = mergeInstallSource(incoming, fromWorker).record
  incoming = mergeInstallSource(incoming, { install_source: channel }, { allowChannel: true }).record

  const existing = await readInstallSource()
  const merged = mergeInstallSource(existing, incoming, { allowChannel: true }).record
  // A startup backfill may have closed the window before this install handler ran.
  merged.source_locked_at = new Date().toISOString()

  await chrome.storage.local.set({
    personalInfo: {},
    stats: {
      installDate: new Date().toISOString(),
      totalAutofills: 0,
    },
    [INSTALL_SOURCE_STORAGE_KEY]: merged,
  })

  console.info('[install-source] captured', installSourceProperties(merged))

  await trackMixpanelEvent('extension_installed', {
    language: self.navigator?.language,
    name_of_install_user_type: 'new',
  })
}

// Upgrades don't get a second look at the install tabs. Stamp the channel once
// and close the first-run window so a later visit to gofillr.com isn't treated
// as the install campaign.
async function backfillInstallChannel() {
  const data = await chrome.storage.local.get([INSTALL_SOURCE_STORAGE_KEY, 'stats'])
  const existing = data[INSTALL_SOURCE_STORAGE_KEY] || {}
  if (existing.install_source && existing.source_locked_at) return existing

  const info = await readManagementInfo()
  const { record } = mergeInstallSource(
    existing,
    { install_source: channelFromInstallType(info?.installType) },
    { allowChannel: true },
  )
  if (!record.source_locked_at) {
    const parsed = Date.parse(data.stats?.installDate || '')
    // No installDate yet means onInstalled(install) hasn't written stats. Leave
    // the window unlocked so that handler (and a landing-tab message) can still
    // record campaign params. An existing installDate closes the window at that
    // timestamp, which is already expired for anyone upgrading later.
    if (!Number.isNaN(parsed)) record.source_locked_at = new Date(parsed).toISOString()
  }
  await chrome.storage.local.set({ [INSTALL_SOURCE_STORAGE_KEY]: record })
  return record
}

async function enrichInstallSourceFromTab(tabUrl, referrer) {
  let hostOk = false
  try {
    hostOk = !!tabUrl && isAttributionHost(new URL(tabUrl).hostname)
  } catch {
    hostOk = false
  }
  if (!hostOk) return null

  const existing = await readInstallSource()
  if (!canEnrichInstallSource(existing)) return existing

  const fields = attributionFromLanding(tabUrl, referrer)
  const { record, changed } = mergeInstallSource(existing, fields)
  if (!changed) return existing

  await chrome.storage.local.set({ [INSTALL_SOURCE_STORAGE_KEY]: record })
  console.info('[install-source] enriched', installSourceProperties(record))
  return record
}

// Installation event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    return enqueueInstallSource(() => handleInstall())
  }
  if (details.reason === 'update') {
    return enqueueInstallSource(() => backfillInstallChannel())
  }
})

enqueueInstallSource(() => backfillInstallChannel())

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

// Same key as src/utils/savedResumeFile.ts SAVED_RESUME_STORAGE_KEY. The content
// script reads it when a Jobvite file input needs the bytes. Sign-out removes it.
const SAVED_RESUME_STORAGE_KEY = 'savedResumeFile'

function userIdFromAccessToken(token) {
  if (!token || typeof token !== 'string') return ''
  const part = token.split('.')[1]
  if (!part) return ''
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    return typeof json.sub === 'string' ? json.sub : ''
  } catch {
    return ''
  }
}

async function cacheUploadedResume({ token, fileName, fileType, fileBytesBase64, storagePath }) {
  if (!fileName || !fileBytesBase64) return
  try {
    await chrome.storage.local.set({
      [SAVED_RESUME_STORAGE_KEY]: {
        userId: userIdFromAccessToken(token),
        fileName,
        fileType: fileType || 'application/octet-stream',
        bytesBase64: fileBytesBase64,
        storagePath: storagePath || null,
        updatedAt: Date.now(),
      },
    })
  } catch (err) {
    console.error('[resume-upload] could not cache the resume file', err)
  }
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// chrome.runtime.sendMessage JSON-serializes. A Uint8Array arrives as
// {"0":37,"1":80}, so the same reply also carries base64. Callers that still
// read `bytes` in memory are unchanged.
function savedResumeReply(result) {
  if (!result || result.ok !== true || !(result.bytes instanceof Uint8Array) || result.bytes.byteLength === 0) {
    return result
  }
  return { ...result, bytesBase64: bytesToBase64(result.bytes) }
}

async function handleResumeUpload({ url, token, profileId, fileName, fileType, fileBytesBase64, embeddedLinks }) {
  await writeResumeJob({ phase: 'uploading', fileName })

  if (!token) {
    await writeResumeJob({
      phase: 'error',
      code: 'no_session',
      message: 'Please sign in again before uploading your resume.',
    })
    return
  }

  let bytes
  try {
    bytes = base64ToBytes(fileBytesBase64)
  } catch (err) {
    console.error('[resume-upload] could not decode the file', err)
    await writeResumeJob({
      phase: 'error',
      code: 'read_failed',
      message: "Couldn't read that file. Please choose another.",
    })
    return
  }

  // The account save is the upload. The parse API is only for prefilling the
  // form; a file in storage with no profiles row is not a saved resume.
  let saved
  try {
    saved = await persistUploadedResume({ token, profileId, fileName, fileType, bytes })
    await cacheUploadedResume({
      token,
      fileName,
      fileType,
      fileBytesBase64,
      storagePath: saved.storagePath,
    })
  } catch (err) {
    console.error('[resume-upload] account save failed', err)
    await writeResumeJob({
      phase: 'error',
      code: 'save_failed',
      message: err instanceof Error ? err.message : "Couldn't save your resume. Please try again.",
    })
    return
  }

  let parsed = null
  let firstUpload = null
  try {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: fileType || 'application/octet-stream' }), fileName)
    // The upload targets one candidate profile (resume-api multi-profiles contract).
    form.append('profile_id', profileId)
    // Ask for a parse even when this profile already has one. The API only returns it (it never
    // rewrites the profile); the popup uses it to fill blank fields.
    form.append('reparse', 'true')

    const res = await fetch(url, {
      method: 'POST',
      // No Content-Type — FormData sets multipart/form-data + boundary.
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const rawBody = await res.text()
    let body = null
    try {
      body = rawBody ? JSON.parse(rawBody) : null
    } catch {
      body = null
    }
    // Never log the response body: it holds the parsed resume (name, phone, address).
    console.log('[resume-upload]', res.status)
    if (res.ok && body && body.success === true) {
      firstUpload = body.data ? body.data.first_upload ?? null : null
      parsed = body.data ? body.data.parsed ?? null : null
      // Links the file carries as link text only (GitHub, LinkedIn): add what the parse missed.
      if (parsed && embeddedLinks && typeof embeddedLinks === 'object') {
        const contact = { ...(parsed.contact || {}) }
        if (embeddedLinks.github && !contact.github) contact.github = embeddedLinks.github
        if (embeddedLinks.linkedin && !contact.linkedin) contact.linkedin = embeddedLinks.linkedin
        parsed = { ...parsed, contact }
      }
    } else {
      console.error('[resume-upload] parse failed after the resume was saved', res.status)
    }
  } catch (err) {
    console.error('[resume-upload] parse request failed after the resume was saved', err)
  }

  try {
    await writeResumeJob({
      phase: 'done',
      fileName,
      firstUpload,
      parsed,
      storagePath: saved.storagePath,
    })
  } catch (err) {
    console.error('[resume-upload] handling response failed', err)
    await writeResumeJob({
      phase: 'error',
      code: 'unexpected',
      message: 'Something went wrong reading the response. Please try again.',
    })
  }
}

// Chrome closes the popup when the Google account window takes focus, so the
// user never sees the signed-in state. Reopen it on the browser window the
// auth window returned focus to, unless the popup somehow survived.
async function reopenPopupAfterSignIn() {
  try {
    const popups = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })
    if (popups.length > 0) return
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
    await chrome.action.openPopup(win?.id ? { windowId: win.id } : undefined)
  } catch (error) {
    // Older Chrome or no focused window. The session is saved; the next open shows it.
    console.warn('[google-sign-in] could not reopen the popup', error)
  }
}

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ExtPay's payment page messages the string "extpay-fetch-user". Returning true
  // here claims that message and never answers it, so the paid-status poll dies
  // and the popup stays on the free cap until Chrome is reloaded.
  if (typeof request !== 'object' || request === null) return

  if (request.action === 'billing') {
    handleBillingMessage(request)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
    return true
  }

  // One Free fill per tab URL per week. Claims for the same page run one at a
  // time, so an embed and its shell cannot both increment the counter.
  if (request.action === 'claimFillQuota' || request.action === 'releaseFillQuota') {
    const pageKey = quotaPageKey(sender?.tab?.url || request.pageKey || '')
    if (!pageKey) {
      sendResponse({ claimed: false, ok: false })
      return true
    }
    const releasing = request.action === 'releaseFillQuota'
    enqueueQuotaClaim(pageKey, async () => {
      const stored = await chrome.storage.session.get(FILL_QUOTA_CLAIMS_KEY)
      const claims = stored[FILL_QUOTA_CLAIMS_KEY] || {}
      if (releasing) {
        await chrome.storage.session.set({
          [FILL_QUOTA_CLAIMS_KEY]: forgetQuotaClaim(claims, pageKey),
        })
        sendResponse({ ok: true })
        return
      }
      const decision = decideQuotaClaim(claims, pageKey, calendarWeekKey(new Date()))
      if (!decision.claimed) {
        sendResponse({ claimed: false })
        return
      }
      await chrome.storage.session.set({ [FILL_QUOTA_CLAIMS_KEY]: decision.claims })
      sendResponse({ claimed: true })
    }).catch(() => {
      sendResponse(releasing ? { ok: false } : { claimed: false, error: true })
    })
    return true
  }

  if (request.action === 'captureInstallAttribution') {
    enqueueInstallSource(() => enrichInstallSourceFromTab(sender?.tab?.url, request.referrer))
      .then((record) => sendResponse({ ok: !!record }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (
    request.action === 'matchScore' ||
    request.action === 'matchScoreDecline' ||
    request.action === 'matchScoreUndoDecline' ||
    request.action === 'fetchJobPosting' ||
    request.action === 'matchScoreAddSkill' ||
    request.action === 'matchScoreRemoveSkill' ||
    request.action === 'matchScoreRelay'
  ) {
    handleMatchScoreMessage(request, sender)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, view: 'hide' }))
    return true
  }

  if (request.action === 'trackMixpanel') {
    // Content scripts and the popup relay here so Mixpanel is not subject to the
    // host page's connect-src. trackMixpanelEvent already swallows fetch errors.
    const eventName = typeof request.eventName === 'string' ? request.eventName : ''
    trackMixpanelEvent(eventName, request.properties)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (request.action === 'openPopup') {
    chrome.action.openPopup()
    sendResponse({ success: true })
  }

  // Content script publishes a storage notice when a Workday page needs a candidate
  // account and Application Accounts has no Workday login. Badge the toolbar so the
  // gap is visible even while the popup is closed.
  if (request.action === 'workdayAccountRequired') {
    const notice = request.notice
    if (notice && notice.portal === 'Workday' && typeof notice.message === 'string') {
      updateBadge('!', '#b05454')
    }
    sendResponse({ ok: true })
    return true
  }

  // Same badge as Workday when an iCIMS login/create-account page has no iCIMS
  // Application Accounts login. The popup reads icimsAccountNotice for the banner.
  if (request.action === 'icimsAccountRequired') {
    const notice = request.notice
    if (notice && notice.portal === 'iCIMS' && typeof notice.message === 'string') {
      updateBadge('!', '#b05454')
    }
    sendResponse({ ok: true })
    return true
  }

  if (request.action === 'ensureContentScript') {
    // The popup found no live content script (tab opened before install or
    // update, or a frame loaded late). Inject into every frame; the install
    // guard in content.js makes this safe to repeat.
    const tabId = request.tabId
    if (typeof tabId !== 'number') {
      sendResponse({ success: false })
      return true
    }
    Promise.allSettled([
      chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['content.css'] }),
      chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] }),
    ]).then(() => sendResponse({ success: true }))
    return true
  }

  // The apply form is in an iframe. The outer career shell only has hidden
  // inputs, and a tab-level autofill message reports that nothing is fillable.
  // Answer from the frame that contains PortalProfileFields.Resume_File.
  if (request.action === 'autofillIcimsTab') {
    const tabId = request.tabId
    if (typeof tabId !== 'number') {
      sendResponse({ success: false, message: 'No fillable fields found' })
      return true
    }
    deliverIcimsAutofill(tabId, { scripting: chrome.scripting, tabs: chrome.tabs })
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ success: false, message: 'Unable to autofill this page' }))
    return true
  }

  // The content script cannot see the page's ICIMS.dropdowns registry. Run the
  // country/state search in that frame's page world. The command only calls
  // dropdown methods. It does not click Next, Log In, Create Account, Submit, or hCaptcha.
  if (request.action === 'icimsPageDropdown') {
    deliverIcimsPageDropdown(request.request, sender, chrome.scripting)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  // Apply pages block a content-script fetch to Supabase. Download the saved
  // resume here and return the bytes. Callers assign a plain file input.
  // This does not click Apply, Next, Submit, or an autofill-from-resume control.
  if (request.action === 'loadSavedResume') {
    loadSavedResumeForWorker()
      .then((result) => sendResponse(savedResumeReply(result)))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (request.action === 'signInWithGoogle') {
    // Same reason as resume upload: the popup is destroyed when the Google
    // account window takes focus, which cancels launchWebAuthFlow if it was
    // started there. This worker outlives that and writes the Supabase session
    // to chrome.storage.local. The popup re-reads it when the message returns,
    // or on the next open if the popup already closed.
    const reply = (payload) => {
      try {
        sendResponse(payload)
      } catch (error) {
        // The popup is already gone. A saved session is still in storage.
        console.error('[google-sign-in] could not deliver the result to the popup', error)
      }
    }
    signInWithGoogleInWorker()
      .then((result) => {
        reply(result)
        if (result?.ok) reopenPopupAfterSignIn()
      })
      .catch((error) =>
        reply({
          ok: false,
          error: error instanceof Error ? error.message : 'Sign-in failed. Please try again.',
        }),
      )
    return true
  }

  if (request.action === 'uploadResume') {
    // Detached on purpose — the in-flight fetch keeps the worker alive; the popup watches
    // chrome.storage.local for the result rather than waiting on this response.
    handleResumeUpload(request)
    sendResponse({ started: true })
  }

  if (request.action === 'trackAutofill') {
    // Answer only after the History row is stored. The popup reloads History as soon as
    // the fill returns; responding before set() left the counter ahead of the list.
    const entry = request.entry
    chrome.storage.local.get(['stats', 'fillHistory', 'activeProfile'], (data) => {
      const stats = data.stats || { totalAutofills: 0, totalResponsesUsed: 0 }
      stats.totalAutofills = (stats.totalAutofills || 0) + 1
      const patch = { stats }
      if (entry) {
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
        const fillHistory = (data.fillHistory || []).filter((e) => e.timestamp >= ninetyDaysAgo)
        const active = data.activeProfile && typeof data.activeProfile.id === 'string' ? data.activeProfile : null
        fillHistory.unshift({
          id: Date.now(),
          profileId: active ? active.id : null,
          profileName: active ? active.name || null : null,
          ...entry,
        })
        patch.fillHistory = fillHistory
      }
      chrome.storage.local.set(patch, () => sendResponse({ success: true }))
    })
    return true
  }

  if (request.action === 'clearFillHistory') {
    chrome.storage.local.set({ fillHistory: [] })
    sendResponse({ success: true })
  }

  return true
})

// Keyboard shortcut. Signed-out on purpose: the popup Autofill button is behind
// Google sign-in, and mirror-only smoke seeds chrome.storage.local.personalInfo
// then uses this command. The content script reads that mirror and does not
// check a session.
if (chrome.commands) {
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'autofill-page') return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0] && tabs[0].id
      if (tabId == null) return
      void deliverAutofillCommand(tabId, {
        sendMessage(id, message) {
          return chrome.tabs.sendMessage(id, message)
        },
        insertCSS(id) {
          return chrome.scripting.insertCSS({
            target: { tabId: id, allFrames: true },
            files: ['content.css'],
          })
        },
        executeScript(id) {
          return chrome.scripting.executeScript({
            target: { tabId: id, allFrames: true },
            files: ['content.js'],
          })
        },
      }).catch((error) => {
        console.error('Autofill command failed', error)
      })
    })
  })
}

// Badge text to show status (optional)
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}
