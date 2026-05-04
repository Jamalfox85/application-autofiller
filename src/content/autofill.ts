import { matchFieldToData } from './fieldMatch.ts'
import { siteRules } from '../utils/siteRules/index.ts'
import { showAutofillNotification, showAutofillPrompt } from './notifications.ts'
import {
  fillNativeInput,
  setSelectValue,
  setCheckboxValue,
  setRadioValue,
} from '@/utils/inputHandlers.ts'
import { PersonalInfo } from '../types/index.ts'

// import { api } from '../lib/api'
type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

let filledCount = 0

export async function autofillPage() {
  try {
    const personalInfoData = await chrome.storage.local.get('personalInfo')
    const personalInfo = personalInfoData.personalInfo

    const customResponsesData = await chrome.storage.local.get('customResponses')
    const customResponses = customResponsesData.customResponses || {}

    if (!personalInfo) {
      return { success: false, message: 'No personal info saved' }
    }

    const inputs = deepQuerySelectorAll(document, 'input, textarea, select') as FormField[]

    for (const input of inputs) {
      // Skip hidden, submit, button inputs
      if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
        continue
      }

      // Skip honeypot / bot-catcher fields
      const automationId = (input.getAttribute('data-automation-id') || '').toLowerCase()
      if (automationId.includes('beecatcher') || automationId.includes('honeypot')) {
        continue
      }

      if (
        input.value &&
        input.value.trim() !== '' &&
        input.type != 'checkbox' && // Prevent checkboxes and radio buttons from being filtered here
        input.type != 'radio'
      ) {
        continue
      }

      const fieldText = constructFieldText(input)
      const matchedResult = matchFieldToData(fieldText, personalInfo, customResponses)
      const { matchedValue, relativeMatchKey } = matchedResult || {}

      if (!matchedValue) {
        continue
      }

      // Try site-specific handling first
      let handled = await fillBySiteRule(input, fieldText, personalInfo)
      if (handled) {
        filledCount++
        continue
      }

      handled = await fillByDefault(input, matchedValue, relativeMatchKey)
      if (handled) {
        filledCount++
        continue
      }
    }

    return {
      success: filledCount > 0,
      fieldsCount: filledCount,
      message: filledCount > 0 ? `Filled ${filledCount} fields` : 'No matching fields found',
    }
  } catch (error) {
    return { success: false, message: 'Error during autofill' }
  }
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

  const fieldText =
    `${name} ${id} ${placeholder} ${label} ${ariaLabel} ${autoComplete} ${type}`.toLowerCase()
  const normalizedFieldText = fieldText.toLowerCase().replace(/[\s_,-]/g, '')
  return normalizedFieldText
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

async function fillBySiteRule(input: FormField, fieldText: string, personalInfo: PersonalInfo) {
  // Find an active site rule (if any)
  const activeSiteRule = siteRules.find((rule) => rule.detect())

  if (activeSiteRule && (await activeSiteRule.apply(input, fieldText, personalInfo))) {
    return true
  }
  return false
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

let hasShownPopup = false
export function debounceAutofill(autoDetectEnabled: boolean) {
  let autofillDebounceTimer = null
  // Clear existing timer
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
  }

  // Wait 800ms after changes stop before autofilling
  autofillDebounceTimer = setTimeout(async () => {
    if (autoDetectEnabled) {
      // Auto-fill the new form
      const result = await autofillPage()
      if (result.success) {
        showAutofillNotification(result.fieldsCount ?? 0)
      }
    } else {
      // Show prompt if we haven't already for this form
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }
  }, 800)
}
