// Runs on all pages on load

import {
  autofillPage,
  claimSubmittedApplications,
  debounceAutofill,
  pageNavigated,
  readAutofillTriggerForSubmission,
} from './autofill.ts'
import {
  showAutofillNotification,
  showAutofillPrompt,
  showErrorNotification,
} from './notifications.ts'
import { jobPlatforms, getSiteLabel } from '../utils/jobSitePatterns.ts'
import { FIELD_POLL_MS, FIELD_WAIT_MS } from '../utils/detectionRetry.ts'
import {
  detectApplicationPage,
  detectApplicationPageWhenReady,
  isKnownApplicationUrl,
  isListingOrBoardUrl,
  shouldOfferAutofillToast,
} from './applicationDetect.ts'
import {
  autofillPromptClosedByUser,
  connectedAutofillPrompt,
  dismissAutofillPrompt,
  resetAutofillPromptSession,
} from './applicationPrompt.ts'
import { siteRules } from '../utils/siteRules/index.ts'

import { trackEvent } from '../services/mixpanelHttp'
import { showFillPaywall } from './fillPaywall'
import { installProUnlock } from '../services/billing/proUnlock.ts'
import { getProfileSetupCompletedAt } from '../services/profileSetupSession'
import { captureLandingAttribution } from '../services/installSource'
import { detectAts } from '../utils/ats.ts'
import { quotaPageKey } from '../services/billing/quotaPage.ts'
import {
  decideSubmission,
  readSubmissionSnapshot,
  shouldArmOnClick,
  shouldArmOnSubmit,
  submissionBelongsToAutofill,
} from './submissionEvidence.ts'
import { onMatchScoreRender, startMatchScore } from './matchScore.ts'
import { configureWorkdayAccountNotice } from '../utils/siteRules/workdayAccountNotice.ts'
import { configureIcimsAccountNotice } from '../utils/siteRules/icimsAccountNotice.ts'

const CONTENT_SCRIPT_INSTALLED = '__gofillrContentScript'

// Workday account creation calls this when Application Accounts has no Workday login.
// The page toast is immediate; the service worker badges the toolbar; the popup opens
// Application Accounts when the user opens GoFillr.
configureWorkdayAccountNotice({
  showOnPage: (message) => showErrorNotification(message),
  sendMessage: (message) => chrome.runtime.sendMessage(message),
})

// iCIMS login/create-account calls this when Application Accounts has no iCIMS login.
// Same three channels as Workday: page toast, toolbar badge, popup Application Accounts.
configureIcimsAccountNotice({
  showOnPage: (message) => showErrorNotification(message),
  sendMessage: (message) => chrome.runtime.sendMessage(message),
})

function isTopFrame() {
  try {
    return window.top === window
  } catch {
    return false
  }
}

// Register before page setup. A throw while scanning the page must not leave the
// tab without a listener — that is the "Receiving end does not exist" failure on
// the Ctrl+Shift+F path. The flag skips a second listener when the service worker
// reinjects this file into a frame that already has it.
function onRuntimeMessage(request, _sender, sendResponse) {
  if (request.action === 'autofill') {
    autofillPage('user_clicked_button').then((result) => {
      // The popup draws the paywall itself. The shortcut has no popup, so the page does.
      const onPagePaywall = request.surface !== 'popup'
      if (result.code === 'hard_cap' || result.paywall === 'hard') {
        if (onPagePaywall) void showFillPaywall('hard', result)
      } else if (result.success) {
        showAutofillNotification(result)
        if (onPagePaywall && result.paywall === 'soft') void showFillPaywall('soft', result)
      } else {
        showErrorNotification(result.message)
      }
      sendResponse(result)
    })
    return true // Keep message channel open for async response
  }

  if (request.action === 'matchScoreRender') {
    if (isTopFrame()) onMatchScoreRender(request)
    sendResponse({ ok: true })
    return false
  }

  if (request.action === 'detectApplication') {
    // The popup asks each frame and keeps the one with the most controls. Answer
    // for this frame only. A known apply URL retries until the form mounts; a
    // board or listing URL answers immediately so filters are not a form.
    const read = () => detectApplicationPage({ href: window.location.href, document })
    detectApplicationPageWhenReady(read, (ms) => new Promise((r) => setTimeout(r, ms)), {
      timeoutMs: FIELD_WAIT_MS,
      stepMs: FIELD_POLL_MS,
    }).then((result) => {
      sendResponse({
        detected: result.detected,
        siteLabel: result.detected ? getSiteLabel(window.location.hostname) : null,
        fieldCount: result.detected ? result.fieldCount : 0,
      })
    })
    return true
  }
}

async function resumeAutofillAfterPro() {
  const result = await autofillPage('user_clicked_button')
  if (result.code === 'hard_cap' || result.paywall === 'hard') {
    void showFillPaywall('hard', result)
    return
  }
  if (result.success) {
    showAutofillNotification(result)
    if (result.paywall === 'soft') void showFillPaywall('soft', result)
    return
  }
  if (result.message) showErrorNotification(result.message)
}

let hasShownPopup = false
let autoDetectEnabled = true
let applicationHooksInstalled = false
let lateFormWatchInstalled = false
let claimedUrl = ''
let syncGen = 0
// Remix hydration can delete the prompt more than once. Stop after a handful
// of restores so a page that always strips unknown body children cannot loop.
let promptRestores = 0
// initialize() calls confirmTrackedSubmission before this module finishes
// evaluating. These have to exist first: a let below that call is still in the
// temporal dead zone, the promise rejects, and the toast never shows.
let submitAttempt = null
let submissionTimers = []

if (!globalThis[CONTENT_SCRIPT_INSTALLED]) {
  globalThis[CONTENT_SCRIPT_INSTALLED] = true
  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  installProUnlock(resumeAutofillAfterPro)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
  } else {
    initialize()
  }
}

async function initialize() {
  // gofillr.com is not a job page, so this has to run before the early return below.
  // Only the top frame: iframes would report the parent as the referrer.
  if (isTopFrame()) {
    void captureLandingAttribution(window.location.href, document.referrer)
  }

  await maybeTrackConfirmationPage()

  // A board index is not an application, but Greenhouse (and the other ATS hosts)
  // navigate to the apply form without a new document. Watch the URL either way,
  // and watch the DOM for a form that mounts after the first paint.
  installLateFormWatch()

  // Watch for URL changes (SPA navigation). lastUrl has to live outside the tick;
  // declaring it inside made currentUrl === lastUrl on every pass, so this never ran.
  let lastUrl = window.location.href
  setInterval(() => {
    const currentUrl = window.location.href
    if (currentUrl === lastUrl) return
    lastUrl = currentUrl
    pageNavigated()
    void confirmTrackedSubmission(true)
    hasShownPopup = false
    claimedUrl = ''
    promptRestores = 0
    resetAutofillPromptSession()
    dismissAutofillPrompt()
    void syncApplicationPage()
  }, 500)

  void syncApplicationPage()
}

function installLateFormWatch() {
  if (lateFormWatchInstalled || !document.documentElement) return
  lateFormWatchInstalled = true
  let timer = 0
  const observer = new MutationObserver(() => {
    const href = window.location.href
    // Already showing. A Greenhouse hydrate that drops the node falls through
    // and the detect below runs only then.
    if (hasShownPopup && claimedUrl === href && connectedAutofillPrompt(document)) return
    if (isListingOrBoardUrl(href)) return
    if (autofillPromptClosedByUser()) return
    const now = detectApplicationPage({ href, document })
    const offer = shouldOfferAutofillToast(href, now, !isTopFrame())
    if (!offer) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void syncApplicationPage()
    }, FIELD_POLL_MS)
  })
  // documentElement, not body: hydrateRoot(document) can replace <body> and
  // would otherwise leave this observer attached to a detached node.
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function readApplicationPage() {
  return detectApplicationPage({ href: window.location.href, document })
}

async function syncApplicationPage() {
  const gen = ++syncGen
  const hrefAtStart = window.location.href
  const first = readApplicationPage()
  if (gen !== syncGen || window.location.href !== hrefAtStart) return

  // Site rules mount immediately (Workday's Apply click, iCIMS login, Greenhouse
  // education rows), including on a board that must not toast. Waiting for a late
  // form here used to delay that setup.
  const siteRuleMatches = siteRules.some((rule) => rule.detect())
  const worthWatching = first.detected || first.pending || siteRuleMatches || isKnownApplicationUrl(hrefAtStart)
  if (worthWatching) {
    const stored = await chrome.storage.local.get(['personalInfo', 'autoDetectEnabled'])
    if (gen !== syncGen || window.location.href !== hrefAtStart) return
    autoDetectEnabled = stored.autoDetectEnabled ?? true
    installApplicationHooks(stored.personalInfo)
    if (first.detected || isKnownApplicationUrl(hrefAtStart)) void startMatchScore()
  }

  const detection = first.pending
    ? await detectApplicationPageWhenReady(readApplicationPage, (ms) => new Promise((resolve) => setTimeout(resolve, ms)), {
        timeoutMs: FIELD_WAIT_MS,
        stepMs: FIELD_POLL_MS,
      })
    : first
  if (gen !== syncGen || window.location.href !== hrefAtStart) return

  if (!detection.detected) {
    if (claimedUrl === hrefAtStart) return
    dismissAutofillPrompt()
    return
  }
  const offer = shouldOfferAutofillToast(hrefAtStart, detection, !isTopFrame())
  if (!offer || autofillPromptClosedByUser()) return
  const promptConnected = !!connectedAutofillPrompt(document)
  if (claimedUrl === hrefAtStart && promptConnected) return
  if (claimedUrl === hrefAtStart && promptRestores >= 6) return
  const firstOffer = claimedUrl !== hrefAtStart
  if (firstOffer) promptRestores = 0
  else promptRestores += 1
  claimedUrl = hrefAtStart

  // job_site_visit_detected only makes sense once the user actually has a profile to fill
  // with — before that there's no meaningful "time since profile completed" to report.
  const profileCompletedAt = firstOffer ? await getProfileSetupCompletedAt() : null
  if (gen !== syncGen || window.location.href !== hrefAtStart) return
  if (firstOffer && profileCompletedAt) {
    await trackJobSiteVisit(detection.method, profileCompletedAt)
  }

  // Auto-detect ON only offers the fill: a toast the user must click. It never writes to the
  // page on its own (the product promise is "review before fill", and a silent fill bypassed
  // the Free cap and History). Auto-detect OFF shows nothing at all; the popup and shortcut
  // still work.
  if (autoDetectEnabled) {
    if (!connectedAutofillPrompt(document)) {
      showAutofillPrompt()
      hasShownPopup = true
    }
  }
}

function installApplicationHooks(personalInfo) {
  if (applicationHooksInstalled) return
  applicationHooksInstalled = true

  const activeSiteRule = siteRules.find((rule) => rule.detect())
  if (activeSiteRule && activeSiteRule.onMount) {
    activeSiteRule.onMount(personalInfo)
  }

  // Watch for form changes (multi-step forms). A listing the SPA navigates back
  // to must not re-offer just because filter inputs appeared.
  const observer = new MutationObserver((mutations) => {
    const siteSpecificChangeDetected =
      activeSiteRule && activeSiteRule.formChanged && activeSiteRule.formChanged(mutations)
    if (!siteSpecificChangeDetected) return
    const href = window.location.href
    const now = detectApplicationPage({ href, document })
    // iCIMS onMount already ran. The content iframe must not offer a second
    // toast when the password step replaces the email gate.
    if (!shouldOfferAutofillToast(href, now, !isTopFrame())) return
    hasShownPopup = false
    debounceAutofill(autoDetectEnabled)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // application_submitted waits for evidence of success. The submit event and a
  // final Submit click only arm a check; validation errors and a form that is
  // still on screen do not count.
  document.addEventListener(
    'submit',
    (event) => {
      if (!shouldArmOnSubmit(event.target)) return
      scheduleSubmissionChecks()
    },
    true,
  )
  document.addEventListener(
    'click',
    (event) => {
      if (!shouldArmOnClick(event.target)) return
      scheduleSubmissionChecks()
    },
    true,
  )
}

function scheduleSubmissionChecks() {
  for (const timer of submissionTimers) window.clearTimeout(timer)
  submissionTimers = []
  const started = readSubmissionSnapshot(document, window.location.href)
  submitAttempt = {
    href: started.href,
    hadApplicationForm: started.applicationFormPresent,
  }
  for (const delay of [0, 400, 1200]) {
    submissionTimers.push(
      window.setTimeout(() => {
        void confirmTrackedSubmission(delay >= 1200)
      }, delay),
    )
  }
}

async function confirmTrackedSubmission(formGoneSettled) {
  const after = readSubmissionSnapshot(document, window.location.href)
  const decision = decideSubmission({
    submitAttempted: !!submitAttempt,
    hadApplicationForm: !!submitAttempt?.hadApplicationForm,
    beforeHref: submitAttempt?.href ?? null,
    after,
    formGoneSettled,
  })
  if (!decision.fire || !decision.submissionSuccess || !decision.submitMethod) return
  await trackApplicationSubmitted(decision.submitMethod, decision.submissionSuccess)
}

async function trackJobSiteVisit(detectionMethod, profileCompletedAt) {
  const visitKey = `mixpanelJobSiteVisit:${window.location.hostname}${window.location.pathname}`
  try {
    const existing = await chrome.storage.session.get(visitKey)
    if (existing[visitKey]) return
    await chrome.storage.session.set({ [visitKey]: Date.now() })
  } catch {
    // If session storage isn't available, still fire — better a duplicate than a miss.
  }

  const isJobPlatform = jobPlatforms.some((platform) =>
    window.location.href.toLowerCase().includes(platform),
  )
  trackEvent('job_site_visit_detected', {
    job_site: window.location.hostname,
    job_site_supported: isJobPlatform || siteRules.some((rule) => rule.detect()),
    detection_method: detectionMethod,
    time_since_profile_completed_seconds: (Date.now() - profileCompletedAt) / 1000,
  })
}

async function maybeTrackConfirmationPage() {
  await confirmTrackedSubmission(true)
}

async function trackApplicationSubmitted(submitMethod, submissionSuccess) {
  if (!submissionSuccess) return
  const trigger = await readAutofillTriggerForSubmission()
  if (!trigger) return

  const href = window.location.href
  const pageKey = quotaPageKey(href)
  if (
    !submissionBelongsToAutofill({
      href,
      pageKey,
      triggerKey: trigger.applicationKey,
      triggerHost: trigger.jobSite,
    })
  ) {
    return
  }

  const claimed = await claimSubmittedApplications([trigger.applicationKey, pageKey].filter((key) => key))
  if (!claimed) return

  const host = trigger.jobSite || window.location.hostname
  const properties = {
    ats:
      detectAts({
        hostname: host,
        href,
        document,
      }) ?? 'other',
    job_site: host,
    submit_method: submitMethod,
    time_since_autofill_triggered_seconds: (Date.now() - trigger.triggeredAt) / 1000,
    submission_success: submissionSuccess,
  }
  trackEvent('application_submitted', properties)
}

