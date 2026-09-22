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
import { trackFillContract } from '@/services/fillTelemetry'

// import { api } from '../lib/api'

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type AutofillTriggerSource = 'auto_on_detect' | 'user_clicked_button' | 'resync'

type FieldSnapshot = { prevValue: string; prevChecked?: boolean }
type FillRecord = FieldSnapshot & { input: FormField }

let autofillDebounceTimer: ReturnType<typeof setTimeout> | null = null
let hasShownPopup = false

const REVIEW_HIGHLIGHT_CLASS = 'job-autofill-filled'
const REVIEW_NEEDS_ANSWER_CLASS = 'job-autofill-needs-answer'
const REVIEW_HIGHLIGHT_DURATION_MS = 6000

// Populated by the most recent autofillPage() run, consumed by the on-page confirmation
// widget's "Undo fill" and "Jump to first" actions. A fresh run overwrites both — there's
// only ever one page's worth of in-flight fill state to act on.
let lastFillRecords: FillRecord[] = []
let lastUnfilledInputs: FormField[] = []

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

export async function autofillPage(_triggerSource: AutofillTriggerSource = 'user_clicked_button') {
  let filledCount = 0
  let attemptedCount = 0
  let reportedAttempt = false

  const hostname = window.location.hostname
  const reportAttempt = async () => {
    if (reportedAttempt) return
    reportedAttempt = true
    await trackFillContract('autofill_attempted', hostname)
  }

  try {
    const startTime = Date.now()
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

    await reportAttempt()

    if (fillableInputs.length === 0) {
      await trackFillContract('autofill_failed', hostname)
      return { success: false, message: 'No fillable fields found' }
    }

    await markAutofillTriggered()

    const fillRecords: FillRecord[] = []
    const unfilledInputs: FormField[] = []

    for (const input of fillableInputs) {
      attemptedCount++
      const fieldText = constructFieldText(input)
      const snapshot = captureFieldSnapshot(input)

      console.log('Processing field:', fieldText, input)
      // Try site-specific handling first
      let handled =
        !!activeSiteRule &&
        (await activeSiteRule.apply(input, normalizeText(fieldText), personalInfo))
      if (handled) {
        console.log('Filled by site rule:', fieldText, input)
        filledCount++
        fillRecords.push({ input, ...snapshot })
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
        unfilledInputs.push(input)
        continue
      }

      handled = await fillByDefault(input, matchedValue, relativeMatchKey)
      if (handled) {
        console.log('Filled by default logic:', fieldText, input)
        filledCount++
        fillRecords.push({ input, ...snapshot })
        if (reviewHighlightEnabled) highlightFilledField(input)
        continue
      }

      unfilledInputs.push(input)
    }

    lastFillRecords = fillRecords
    lastUnfilledInputs = unfilledInputs

    await trackFillContract(filledCount > 0 ? 'autofill_succeeded' : 'autofill_failed', hostname)

    return {
      success: filledCount > 0,
      fieldsCount: filledCount,
      totalCount: attemptedCount,
      unfilledCount: unfilledInputs.length,
      elapsedMs: Date.now() - startTime,
      roleGuess: guessJobTitle(),
      message: filledCount > 0 ? `Filled ${filledCount} fields` : 'No matching fields found',
    }
  } catch {
    await reportAttempt()
    await trackFillContract('autofill_failed', hostname)
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

function captureFieldSnapshot(input: FormField): FieldSnapshot {
  if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
    return { prevValue: input.value, prevChecked: input.checked }
  }
  return { prevValue: input.value }
}

// Restores every field the most recent autofillPage() run changed, back to its pre-fill
// value. Generic across fill paths (site rules and the default matcher alike) since it
// snapshots before the fill rather than reasoning about how each path writes values.
export function undoLastFill(): number {
  const records = lastFillRecords
  lastFillRecords = []
  lastUnfilledInputs = []

  let restoredCount = 0
  for (const { input, prevValue, prevChecked } of records) {
    if (!input.isConnected) continue

    if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
      if (input.checked !== !!prevChecked) {
        input.checked = !!prevChecked
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      restoredCount++
      continue
    }

    if (input instanceof HTMLSelectElement) {
      input.value = prevValue
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      restoredCount++
      continue
    }

    const proto =
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    nativeSetter?.call(input, prevValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    restoredCount++
  }

  return restoredCount
}

// Scrolls to and focuses the first field the last fill left unanswered, for the on-page
// confirmation widget's "Jump to first" button.
export function jumpToFirstUnfilled(): boolean {
  const target = lastUnfilledInputs.find((input) => input.isConnected)
  if (!target) return false

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.focus({ preventScroll: true })
  target.classList.add(REVIEW_NEEDS_ANSWER_CLASS)
  setTimeout(() => target.classList.remove(REVIEW_NEEDS_ANSWER_CLASS), REVIEW_HIGHLIGHT_DURATION_MS)
  return true
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
        showAutofillNotification(result)
      }
    } else {
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }
  }, 800)
}
