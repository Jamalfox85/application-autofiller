// Runs on all pages on load

import { autofillPage, debounceAutofill, consumeAutofillTriggerForSubmission } from './autofill.ts'
import {
  showAutofillNotification,
  showAutofillPrompt,
  showErrorNotification,
} from './notifications.ts'
import {
  jobPlatforms,
  excludePatterns,
  applicationUrlPatterns,
  getSiteLabel,
} from '../utils/jobSitePatterns.ts'
import { siteRules } from '../utils/siteRules/index.ts'

import { trackEvent } from '../services/mixpanelHttp'
import { getProfileSetupCompletedAt } from '../services/profileSetupSession'

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}

let hasShownPopup = false
async function initialize() {
  await maybeTrackConfirmationPage()

  // Check if this is a job application page
  const detection = detectJobApplicationPage()
  if (!detection.detected) {
    return
  }

  const personalInfoData = await chrome.storage.local.get('personalInfo')
  const personalInfo = personalInfoData.personalInfo

  // job_site_visit_detected only makes sense once the user actually has a profile to fill
  // with — before that there's no meaningful "time since profile completed" to report.
  const profileCompletedAt = await getProfileSetupCompletedAt()
  if (profileCompletedAt) {
    await trackJobSiteVisit(detection.method, profileCompletedAt)
  }

  // Get user's auto-detect preference
  const settings = await chrome.storage.local.get('autoDetectEnabled')
  const autoDetectEnabled = settings.autoDetectEnabled ?? true

  if (autoDetectEnabled) {
    // Auto-detect is ON - auto-fill after delay
    setTimeout(async () => {
      const result = await autofillPage('auto_on_detect')
      if (result.success) {
        showAutofillNotification(result.fieldsCount)
      }
    }, 1000)
  } else {
    // Auto-detect is OFF - show popup prompt to user
    setTimeout(() => {
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }, 1000)
  }

  const activeSiteRule = siteRules.find((rule) => rule.detect())
  if (activeSiteRule && activeSiteRule.onMount) {
    activeSiteRule.onMount(personalInfo)
  }

  // Watch for form changes (multi-step forms)
  const observer = new MutationObserver((mutations) => {
    const siteSpecificChangeDetected =
      activeSiteRule && activeSiteRule.formChanged && activeSiteRule.formChanged(mutations)

    if (siteSpecificChangeDetected) {
      hasShownPopup = false
      debounceAutofill(autoDetectEnabled)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Watch for URL changes (SPA navigation)
  setInterval(() => {
    let lastUrl = window.location.href
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl
      hasShownPopup = false

      setTimeout(async () => {
        if (autoDetectEnabled) {
          const result = await autofillPage('auto_on_detect')
          if (result.success) {
            showAutofillNotification(result.fieldsCount)
          }
        } else {
          showAutofillPrompt()
          hasShownPopup = true
        }
      }, 1000)
    }
  }, 500)

  // Best-effort application_submitted detection: only fires on forms the extension actually
  // engaged with (autofill was triggered this session). clicked_submit is the form submit
  // event; confirmation_page is handled separately in maybeTrackConfirmationPage.
  document.addEventListener(
    'submit',
    () => {
      void trackApplicationSubmitted('clicked_submit')
    },
    true,
  )
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

function isConfirmationPage() {
  const url = window.location.href.toLowerCase()
  return /thank[-_ ]?you|application[-_ ]?(submitted|received|complete)|\/confirmation|\/success/.test(
    url,
  )
}

async function maybeTrackConfirmationPage() {
  if (!isConfirmationPage()) return
  await trackApplicationSubmitted('confirmation_page')
}

async function trackApplicationSubmitted(submitMethod) {
  const trigger = await consumeAutofillTriggerForSubmission()
  if (!trigger) return

  trackEvent('application_submitted', {
    job_site: trigger.jobSite || window.location.hostname,
    submit_method: submitMethod,
    time_since_autofill_triggered_seconds: (Date.now() - trigger.triggeredAt) / 1000,
    submission_success: true,
  })
}

function detectJobApplicationPage() {
  const url = window.location.href.toLowerCase()

  const isJobPlatform = jobPlatforms.some((platform) => url.includes(platform))
  if (isJobPlatform) {
    return { detected: true, method: 'url_pattern' }
  }

  if (excludePatterns.some((pattern) => url.includes(pattern))) {
    return { detected: false, method: null }
  }

  const hasApplicationUrl = applicationUrlPatterns.some((pattern) => url.includes(pattern))

  // It's likely a job application if:
  // 1. URL suggests application page AND has basic form fields, OR
  // 2. Page has job-specific fields (resume, cover letter, etc.)
  const hasForm = document.querySelectorAll('form').length > 0

  return { detected: hasApplicationUrl && hasForm, method: 'dom_detection' }
}

function isLikelyJobApplicationPage() {
  return detectJobApplicationPage().detected
}

// Listen for messages from the popup and the keyboard-shortcut command
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillPage('user_clicked_button').then((result) => {
      // Also show an on-page toast — needed for the ⌘⇧F shortcut path, where the popup
      // (and its own success view) isn't open to give feedback.
      if (result.success) {
        showAutofillNotification(result.fieldsCount)
      } else {
        showErrorNotification(result.message)
      }
      sendResponse(result)
    })
    return true // Keep message channel open for async response
  }

  if (request.action === 'detectApplication') {
    const detected = isLikelyJobApplicationPage()
    sendResponse({
      detected,
      siteLabel: detected ? getSiteLabel(window.location.hostname) : null,
      fieldCount: detected
        ? document.querySelectorAll('input, textarea, select').length
        : 0,
    })
    return false
  }
})
