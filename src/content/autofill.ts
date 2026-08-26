import { matchFieldToData } from './fieldMatch.ts'
import { siteRules } from '../utils/siteRules/index.ts'
import { showAutofillNotification, showAutofillPrompt } from './notifications.ts'
import {
  fillNativeInput,
  setSelectValue,
  setCheckboxValue,
  setRadioValue,
} from '@/utils/inputHandlers.ts'
import { normalizeText } from '@/utils/helpers.ts'
import { captureEvent } from '@/services/posthog'
import { trackEvent } from '@/services/mixpanelHttp'

// import { api } from '../lib/api'

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type AutofillTriggerSource = 'auto_on_detect' | 'user_clicked_button' | 'resync'

let autofillDebounceTimer: ReturnType<typeof setTimeout> | null = null
let hasShownPopup = false

const REVIEW_HIGHLIGHT_CLASS = 'job-autofill-filled'
const REVIEW_HIGHLIGHT_DURATION_MS = 6000

// Stable per page-load identifiers/counters for the autofill analytics events below.
const FORM_INSTANCE_ID = crypto.randomUUID()
let attemptCountForForm = 0
let lastAutofillTriggeredAt: number | null = null

const AUTOFILL_TRIGGERED_AT_KEY = 'lastAutofillTriggeredAt'
const AUTOFILL_JOB_SITE_KEY = 'lastAutofillJobSite'
const APPLICATION_SUBMITTED_FOR_KEY = 'applicationSubmittedForTrigger'

export function getLastAutofillTriggeredAt() {
  return lastAutofillTriggeredAt
}

export async function markAutofillTriggered() {
  lastAutofillTriggeredAt = Date.now()
  try {
    await chrome.storage.session.set({
      [AUTOFILL_TRIGGERED_AT_KEY]: lastAutofillTriggeredAt,
      [AUTOFILL_JOB_SITE_KEY]: window.location.hostname,
    })
  } catch {
    // chrome.storage.session is unavailable in some test/old contexts — memory is enough
    // for same-page submit tracking.
  }
  return lastAutofillTriggeredAt
}

export async function consumeAutofillTriggerForSubmission(): Promise<{
  triggeredAt: number
  jobSite: string
} | null> {
  try {
    const data = await chrome.storage.session.get([
      AUTOFILL_TRIGGERED_AT_KEY,
      AUTOFILL_JOB_SITE_KEY,
      APPLICATION_SUBMITTED_FOR_KEY,
    ])
    const triggeredAt = data[AUTOFILL_TRIGGERED_AT_KEY] as number | undefined
    if (!triggeredAt) return null
    if (data[APPLICATION_SUBMITTED_FOR_KEY] === triggeredAt) return null
    await chrome.storage.session.set({ [APPLICATION_SUBMITTED_FOR_KEY]: triggeredAt })
    return {
      triggeredAt,
      jobSite: (data[AUTOFILL_JOB_SITE_KEY] as string) || window.location.hostname,
    }
  } catch {
    if (!lastAutofillTriggeredAt) return null
    const triggeredAt = lastAutofillTriggeredAt
    lastAutofillTriggeredAt = null
    return { triggeredAt, jobSite: window.location.hostname }
  }
}

function isSkippableField(input: FormField) {
  if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
    return true
  }

  const automationId = (input.getAttribute('data-automation-id') || '').toLowerCase()
  if (automationId.includes('beecatcher') || automationId.includes('honeypot')) {
    return true
  }

  if (
    input.value &&
    input.value.trim() !== '' &&
    input.type != 'checkbox' &&
    input.type != 'radio'
  ) {
    return true
  }

  return false
}

// Best-effort guess at which section of a multi-step ATS form is showing. There's no
// generic "current step" concept in the site-rules architecture, so this just looks for
// common section headings on the page — falls back to 'unknown' rather than guessing wrong.
function guessFormStep(): string {
  const headingText = Array.from(document.querySelectorAll('h1, h2, h3, legend'))
    .map((el) => (el.textContent || '').toLowerCase())
    .join(' ')

  if (/education|degree|university|school/.test(headingText)) return 'education'
  if (/experience|work history|employment/.test(headingText)) return 'work_history'
  if (/skill/.test(headingText)) return 'skills'
  if (/personal|contact|basic info/.test(headingText)) return 'personal_info'
  return 'unknown'
}

export async function autofillPage(triggerSource: AutofillTriggerSource = 'user_clicked_button') {
  let filledCount = 0
  let attemptedCount = 0
  attemptCountForForm++

  try {
    const personalInfoData = await chrome.storage.local.get('personalInfo')
    const personalInfo = personalInfoData.personalInfo

    const customResponsesData = await chrome.storage.local.get('customResponses')
    const customResponses = customResponsesData.customResponses || {}

    const reviewSettingData = await chrome.storage.local.get('reviewHighlightEnabled')
    const reviewHighlightEnabled = reviewSettingData.reviewHighlightEnabled ?? true

    if (!personalInfo) {
      return { success: false, message: 'No personal info saved' }
    }

    const inputs = deepQuerySelectorAll(document, 'input, textarea, select') as FormField[]
    const fillableInputs = inputs.filter((input) => !isSkippableField(input))
    const activeSiteRule = siteRules.find((rule) => rule.detect())

    if (fillableInputs.length === 0) {
      trackEvent('autofill_blocked_or_failed', {
        failure_reason: 'no_form_detected',
        job_site: window.location.hostname,
        failure_stage: 'detection',
        attempt_count_for_form: attemptCountForForm,
      })
      return { success: false, message: 'No fillable fields found' }
    }

    await markAutofillTriggered()

    for (const input of fillableInputs) {
      attemptedCount++
      const fieldText = constructFieldText(input)

      console.log('Processing field:', fieldText, input)
      // Try site-specific handling first
      let handled =
        !!activeSiteRule &&
        (await activeSiteRule.apply(input, normalizeText(fieldText), personalInfo))
      if (handled) {
        console.log('Filled by site rule:', fieldText, input)
        filledCount++
        if (reviewHighlightEnabled) highlightFilledField(input)
        continue
      }

      // Fill by default matching logic second
      const matchedResult = matchFieldToData(
        normalizeText(fieldText),
        personalInfo,
        customResponses,
      )
      const { matchedValue, relativeMatchKey } = matchedResult || {}
      if (!matchedValue) {
        continue
      }

      handled = await fillByDefault(input, matchedValue, relativeMatchKey)
      if (handled) {
        console.log('Filled by default logic:', fieldText, input)
        filledCount++
        if (reviewHighlightEnabled) highlightFilledField(input)
        continue
      }
    }

    await captureEvent('application_autofilled', {
      filledCount: filledCount,
      success: filledCount > 0,
      action: 'application_autofill',
    })

    const fieldsFailedCount = Math.max(attemptedCount - filledCount, 0)
    const filledDenom = filledCount + fieldsFailedCount

    trackEvent('autofill_triggered', {
      trigger_source: triggerSource,
      form_step_detected: guessFormStep(),
      fill_fields_attempted_count: attemptedCount,
      autofill_success: filledCount > 0,
    })

    trackEvent('autofill_completed', {
      form_instance_id: FORM_INSTANCE_ID,
      fields_filled_count: filledCount,
      fields_failed_count: fieldsFailedCount,
      filled_percent: filledDenom === 0 ? 0 : Math.round((filledCount / filledDenom) * 100),
    })

    return {
      success: filledCount > 0,
      fieldsCount: filledCount,
      totalCount: attemptedCount,
      roleGuess: guessJobTitle(),
      message: filledCount > 0 ? `Filled ${filledCount} fields` : 'No matching fields found',
    }
  } catch (error) {
    trackEvent('autofill_blocked_or_failed', {
      failure_reason: 'parse_error',
      job_site: window.location.hostname,
      failure_stage: 'injection',
      attempt_count_for_form: attemptCountForForm,
    })
    return { success: false, message: 'Error during autofill' }
  }
}

// Best-effort job title guess for the fill-history entry — not authoritative, just a label.
function guessJobTitle(): string {
  const heading = document.querySelector('h1')?.textContent?.trim()
  if (heading) return heading

  const title = document.title.trim()
  return title || 'Untitled application'
}

function highlightFilledField(input: FormField) {
  input.classList.add(REVIEW_HIGHLIGHT_CLASS)
  setTimeout(() => input.classList.remove(REVIEW_HIGHLIGHT_CLASS), REVIEW_HIGHLIGHT_DURATION_MS)
}

function deepQuerySelectorAll(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = []

  // Query within the current root
  results.push(...Array.from(root.querySelectorAll(selector)))

  // Recurse into shadow roots
  const allElements = root.querySelectorAll('*')
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      results.push(...deepQuerySelectorAll(el.shadowRoot, selector))
    }
  }

  return results
}

function constructFieldText(input: FormField) {
  const name = (input.name || '').toLowerCase()
  const id = (input.id || '').toLowerCase()
  const placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
  const label = getFieldLabel(input)
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()
  const autoComplete = (input.autocomplete || '').toLowerCase().replace(/\s+/g, '_')
  const type = (input.type || '').toLowerCase()

  // Keep spaces! Just normalize special chars to spaces
  const fieldText = `${name} ${id} ${placeholder} ${label} ${ariaLabel} ${autoComplete} ${type}`
    .toLowerCase()
    .replace(/[_,-]/g, ' ') // Convert separators to spaces, don't remove them
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()

  return fieldText
}

function getFieldLabel(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`)
    if (label) {
      return label.textContent.toLowerCase()
    }
  }

  if (input.name) {
    const label = document.querySelector(`label[for="${input.name}"]`)
    if (label) {
      return label.textContent.toLowerCase()
    }
  }

  const parentLabel = input.closest('label')
  if (parentLabel) {
    return parentLabel.textContent.toLowerCase()
  }

  let sibling = input.previousElementSibling
  while (sibling) {
    if (sibling.tagName === 'LABEL') {
      return sibling.textContent.toLowerCase()
    }
    sibling = sibling.previousElementSibling
  }

  return ''
}

async function fillByDefault(
  input: FormField,
  matchedValue: string,
  relativeMatchKey: string | undefined,
) {
  if (input instanceof HTMLSelectElement && relativeMatchKey) {
    const handled = setSelectValue(input, matchedValue, relativeMatchKey)
    if (handled) {
      return true
    }
  } else if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    const handled = setCheckboxValue(input, matchedValue)
    if (handled) {
      return true
    }
  } else if (input instanceof HTMLInputElement && input.type === 'radio' && relativeMatchKey) {
    const handled = setRadioValue(input, matchedValue, relativeMatchKey)
    if (handled) {
      return true
    }
  } else {
    // Handle regular inputs and textareas (both have .value)
    await fillNativeInput(input as HTMLInputElement | HTMLTextAreaElement, matchedValue)
    await new Promise((resolve) => setTimeout(resolve, 100))
    return true
  }
  return false
}

export function debounceAutofill(autoDetectEnabled: boolean) {
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
  }

  autofillDebounceTimer = setTimeout(async () => {
    if (autoDetectEnabled) {
      const result = await autofillPage('resync')
      if (result.success) {
        showAutofillNotification(result.fieldsCount ?? 0)
      }
    } else {
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }
  }, 800)
}
