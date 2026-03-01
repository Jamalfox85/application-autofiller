import { RELATIVE_MATCHES } from '../utils/relativeMatches.ts'
import { matchFieldToData } from './fieldMatch.ts'
import { siteRules } from '../utils/siteRules.ts'
import { showAutofillNotification, showAutofillPrompt } from './notifications.ts'

// import { api } from '../lib/api'
type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export async function autofillPage() {
  try {
    const personalInfoData = await chrome.storage.local.get('personalInfo')
    const personalInfo = personalInfoData.personalInfo

    const savedResponsesData = await chrome.storage.local.get('savedResponses')
    const savedResponses = savedResponsesData.savedResponses || {}

    if (!personalInfo) {
      return { success: false, message: 'No personal info saved' }
    }

    // const inputs = getAllInputs()
    const inputs = document.querySelectorAll<FormField>('input, textarea, select')

    let filledCount = 0

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

      const name = (input.name || '').toLowerCase()
      const id = (input.id || '').toLowerCase()
      const placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
      const label = getFieldLabel(input)
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()
      const autoComplete = (input.autocomplete || '').toLowerCase().replace(/\s+/g, '_')
      const type = (input.type || '').toLowerCase()

      const fieldText =
        `${name} ${id} ${placeholder} ${label} ${ariaLabel} ${autoComplete} ${type}`.toLowerCase()
      const normalizedFieldText = fieldText.toLowerCase().replace(/[\s_-]/g, '')

      console.log('Field Text: ', normalizedFieldText)

      // Find an active site rule (if any)
      const activeSiteRule = siteRules.find((rule) => rule.detect())

      // Try site-specific handling first
      if (
        activeSiteRule &&
        (await activeSiteRule.apply(input, normalizedFieldText, personalInfo))
      ) {
        filledCount++
        continue
      }

      const matchResult = matchFieldToData(normalizedFieldText, personalInfo, savedResponses)
      console.log('MATCHED REUSLT: ', matchResult)

      if (!matchResult) {
        continue
      }

      const { fieldValue, fieldKey } = matchResult

      if (fieldValue) {
        // Handle SELECT elements
        if (input instanceof HTMLSelectElement) {
          if (setSelectValue(input, String(fieldValue), fieldKey)) {
            filledCount++
          }
        } else if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          const normalizedFieldValue = String(fieldValue).toLowerCase()
          const isChecked =
            normalizedFieldValue === 'true' ||
            normalizedFieldValue === 'yes' ||
            normalizedFieldValue === '1'

          input.checked = isChecked
          input.dispatchEvent(new Event('change', { bubbles: true }))
          filledCount++
        } else if (input instanceof HTMLInputElement && input.type === 'radio') {
          const normalizedFieldValue = String(fieldValue)
            .toLowerCase()
            .replace(/[\s_-]/g, '')
          const normalizedLabel = label.toLowerCase().replace(/[\s_-]/g, '')
          if (normalizedLabel.includes(normalizedFieldValue)) {
            input.checked = true
            filledCount++
          }
        } else if (
          input instanceof HTMLInputElement &&
          input.pattern &&
          normalizedFieldText.includes('year')
        ) {
          const pattern = input.pattern
          let formattedValue = String(fieldValue)

          if (typeof fieldValue === 'string' && fieldValue.includes('-')) {
            const [year, month, day] = fieldValue.split('-')

            if (pattern.includes('\\d{4}') || pattern === '[0-9]{4}') {
              // Year only: yyyy
              formattedValue = year
            } else if (pattern.includes('/')) {
              // Month/Year: mm/yyyy
              formattedValue = `${month}/${year}`
            } else if (pattern.includes('-') && pattern.includes('d')) {
              // Full date: yyyy-mm-dd
              formattedValue = `${year}-${month}-${day}`
            }
          }

          input.value = formattedValue
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          filledCount++
        } else {
          // Handle regular inputs and textareas (both have .value)
          input.value = String(fieldValue)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          filledCount++
        }
      }
    }

    return {
      success: filledCount > 0,
      fieldsCount: filledCount,
      message: filledCount > 0 ? `Filled ${filledCount} fields` : 'No matching fields found',
    }
  } catch (error) {
    console.error('Error during autofill:', error)
    return { success: false, message: 'Error during autofill' }
  }
}

// function getAllInputs(): FormField[] {
//   const results: FormField[] = []

//   function pierce(root: Document | ShadowRoot | Element) {
//     const inputs = root.querySelectorAll<FormField>('input, textarea, select')
//     inputs.forEach((el) => results.push(el))

//     root.querySelectorAll('*').forEach((el) => {
//       if (el.shadowRoot) {
//         pierce(el.shadowRoot)
//       }
//     })
//   }

//   pierce(document)
//   console.log('Pierced inputs: ', results)
//   return results
// }

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

function setSelectValue(
  selectElement: HTMLSelectElement,
  desiredValue: string,
  fieldKey: string,
): boolean {
  const relativeMatch =
    fieldKey in RELATIVE_MATCHES
      ? RELATIVE_MATCHES[fieldKey as keyof typeof RELATIVE_MATCHES]
      : undefined

  const options = Array.from(selectElement.options)
  const normalizedDesired = desiredValue.toLowerCase().trim()

  // Try 1: Exact match (case-insensitive)
  let matchedOption = options.find(
    (opt) =>
      opt.value.toLowerCase() === normalizedDesired || opt.text.toLowerCase() === normalizedDesired,
  )

  // Try 2: Partial match - option contains desired value
  if (!matchedOption) {
    matchedOption = options.find(
      (opt) =>
        opt.value.toLowerCase().includes(normalizedDesired) ||
        opt.text.toLowerCase().includes(normalizedDesired),
    )
  }

  // Try 3: Partial match - desired value contains option
  if (!matchedOption) {
    matchedOption = options.find(
      (opt) =>
        normalizedDesired.includes(opt.value.toLowerCase()) ||
        normalizedDesired.includes(opt.text.toLowerCase()),
    )
  }

  // Try 4: Relative match - desired value is similar to option
  if (!matchedOption) {
    const similarOptions = relativeMatch?.find((group) => group.includes(normalizedDesired))
    if (similarOptions) {
      matchedOption = options.find((opt) =>
        similarOptions.some(
          (variant) =>
            opt.value.toLowerCase() === variant || opt.value.toLowerCase().includes(variant),
        ),
      )
    }
  }

  if (matchedOption) {
    selectElement.value = matchedOption.value

    // Trigger change events
    selectElement.dispatchEvent(new Event('change', { bubbles: true }))
    selectElement.dispatchEvent(new Event('input', { bubbles: true }))

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
