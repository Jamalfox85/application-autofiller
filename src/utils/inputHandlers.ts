import { RELATIVE_MATCHES } from '../utils/relativeMatches.ts'
import { bestOptionIndex } from './optionMatch.ts'

type ReactTrackedField = (HTMLInputElement | HTMLTextAreaElement) & {
  _valueTracker?: { setValue: (value: string) => void }
}

// React 16+ ignores a native value write unless the value tracker is reset first.
// Greenhouse text fields and react-select search boxes are controlled inputs, so a
// plain `input.value = …` plus an input event never reaches the component.
export function setReactInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  const previous = input.value
  setter?.call(input, value)
  const tracker = (input as ReactTrackedField)._valueTracker
  if (tracker) tracker.setValue(previous)
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
}

export async function fillNativeInput(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return

  input.focus()
  input.dispatchEvent(new Event('focus', { bubbles: true }))

  let current = ''
  for (const char of value) {
    current += char
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    setReactInputValue(input, current)
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
}

export async function fillWorkdayInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  try {
    // Focus the input
    input.focus()

    // Directly set the value
    input.value = value

    // Dispatch events to notify React/listeners
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }))

    console.log(`Filled input with value: ${value}`)
  } catch (error) {
    console.error('Error filling input:', error)
  }
}

export const fillReactSelect = async (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string | string[],
  selectId?: string,
): Promise<boolean> => {
  const values = (Array.isArray(value) ? value : [value]).map((entry) => entry.trim()).filter(Boolean)
  if (values.length === 0) return false

  if (input instanceof HTMLSelectElement) {
    for (const candidate of values) {
      if (setSelectValue(input, candidate, '')) return true
    }
    return false
  }

  if (!(input instanceof HTMLInputElement)) return false

  for (const currentValue of values) {
    try {
      openReactSelect(input)
      await delay(150)
      setReactInputValue(input, '')
      setReactInputValue(input, currentValue)

      const found = await waitForOptionMatch(input, currentValue, selectId)
      if (found) {
        await delay(200)
        return true
      }

      setReactInputValue(input, '')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } catch (error) {
      console.error('[fillReactSelect] Error:', error)
      return false
    }
  }

  input.blur()
  return false
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function openReactSelect(input: HTMLInputElement) {
  input.focus()
  const root = input.closest('.select') || input.parentElement
  const toggle = root?.querySelector<HTMLButtonElement>('button[aria-label="Toggle flyout"]')
  // Greenhouse comboboxes open from the flyout button. Clicking it again closes the menu,
  // so if focus already expanded the list, leave it alone.
  if (toggle && input.getAttribute('aria-expanded') !== 'true') {
    toggle.click()
    return
  }
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  input.click()
}

// react-select commits an option on mousedown (click alone runs after blur and is dropped).
function commitReactOption(option: HTMLElement) {
  const eventInit: MouseEventInit = { bubbles: true, cancelable: true, view: window }
  option.dispatchEvent(new MouseEvent('mousedown', eventInit))
  option.dispatchEvent(new MouseEvent('mouseup', eventInit))
  option.click()
}

const waitForOptionMatch = (
  input: HTMLInputElement,
  searchValue: string,
  selectId?: string,
  maxRetries = 40,
  retryCount = 0,
  optionsSeenAt = -1,
): Promise<boolean> => {
  return new Promise((resolve) => {
    const options = collectReactOptions(input, selectId).filter(
      (option) => !isPlaceholderOption(option.textContent || ''),
    )
    const optionIndex =
      options.length > 0
        ? bestOptionIndex(
            options.map((option) => option.textContent?.trim() || ''),
            searchValue,
          )
        : -1
    const match = optionIndex >= 0 ? options[optionIndex] : undefined

    if (match instanceof HTMLElement) {
      commitReactOption(match)
      resolve(true)
      return
    }

    const seenAt = options.length > 0 && optionsSeenAt < 0 ? retryCount : optionsSeenAt
    // Once real options are on screen, give the typeahead a moment to swap in filtered
    // results, then move on. Empty menus keep polling for the slower school/city APIs.
    const stillWaiting =
      retryCount < maxRetries && (seenAt < 0 || retryCount < seenAt + 12)
    if (stillWaiting) {
      setTimeout(() => {
        resolve(
          waitForOptionMatch(input, searchValue, selectId, maxRetries, retryCount + 1, seenAt),
        )
      }, 100)
      return
    }

    resolve(false)
  })
}

function isPlaceholderOption(text: string): boolean {
  const normalized = text.toLowerCase().trim()
  return (
    normalized === 'no options' ||
    normalized === 'select...' ||
    normalized === 'select' ||
    normalized.startsWith('loading')
  )
}

function collectReactOptions(input: HTMLInputElement, selectId?: string): HTMLElement[] {
  const inputId = input.id
  const listbox =
    (inputId && document.getElementById(`react-select-${inputId}-listbox`)) ||
    (inputId && document.querySelector(`[role="listbox"][id*="${CSS.escape(inputId)}"]`)) ||
    findVisibleListbox()

  const fromListbox = listbox
    ? Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
    : []
  if (fromListbox.length > 0) return fromListbox

  if (selectId) {
    return Array.from(document.querySelectorAll<HTMLElement>(selectId))
  }
  return []
}

function findVisibleListbox(): Element | null {
  const allListboxes = document.querySelectorAll('[role="listbox"]')
  for (const listbox of allListboxes) {
    const rect = listbox.getBoundingClientRect()
    const style = window.getComputedStyle(listbox)
    if (rect.height > 0 && rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
      return listbox
    }
  }
  return null
}

export function setSelectValue(
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

export function setCheckboxValue(input: HTMLInputElement, matchedValue: string) {
  const normalizedFieldValue = matchedValue.toLowerCase()
  const isChecked =
    normalizedFieldValue === 'true' ||
    normalizedFieldValue === 'yes' ||
    normalizedFieldValue === '1'

  input.checked = isChecked
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function setRadioValue(input: HTMLInputElement, matchedValue: string, fieldText: string) {
  const normalizedFieldValue = matchedValue.toLowerCase().replace(/[\s_-]/g, '')
  if (fieldText.includes(normalizedFieldValue)) {
    input.checked = true
    return true
  }
}

export async function setDateValue(input: HTMLInputElement, matchedValue: string) {
  const pattern = input.pattern
  let formattedValue = String(matchedValue)

  if (typeof matchedValue === 'string' && matchedValue.includes('-')) {
    const [year, month, day] = matchedValue.split('-')

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

  await fillNativeInput(input as HTMLInputElement | HTMLTextAreaElement, String(formattedValue))
  await new Promise((resolve) => setTimeout(resolve, 100))

  return true
}
export const fillBambooHRSelect = (
  selectButton: HTMLButtonElement,
  value: string | string[],
): Promise<void> => {
  return new Promise((resolve) => {
    const values = Array.isArray(value) ? value : [value]
    let currentValueIndex = 0

    const cleanup = () => {
      selectButton.blur()
      resolve()
    }

    const tryNextValue = async () => {
      if (currentValueIndex >= values.length) {
        cleanup()
        return
      }

      const currentValue = values[currentValueIndex]
      currentValueIndex++

      console.log(`[fillBambooHRSelect] Attempting: "${currentValue}"`)

      try {
        // Step 1: Focus the button
        console.log('[fillBambooHRSelect] Focusing select button')
        selectButton.focus()
        await new Promise((r) => setTimeout(r, 100))

        // Step 2: Press Enter or Space to open the dropdown
        console.log('[fillBambooHRSelect] Pressing Enter to open dropdown')
        selectButton.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true,
          }),
        )
        selectButton.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true,
          }),
        )

        // Wait for the dropdown to render
        await new Promise((r) => setTimeout(r, 600))

        // Step 3: Wait for the search input to appear
        let searchInput: HTMLInputElement | null = null
        let retries = 0
        while (!searchInput && retries < 30) {
          await new Promise((r) => setTimeout(r, 100))
          searchInput = document.querySelector('.fab-MenuSearch__input') as HTMLInputElement
          console.log(`[fillBambooHRSelect] Searching for input... attempt ${retries + 1}`)
          retries++
        }

        if (!searchInput) {
          console.log('[fillBambooHRSelect] Search input never appeared')
          await new Promise((r) => setTimeout(r, 300))
          tryNextValue()
          return
        }

        console.log('[fillBambooHRSelect] Search input found, typing value')

        // Step 4: Focus and type into the search input
        searchInput.focus()
        searchInput.value = ''
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))

        await new Promise((r) => setTimeout(r, 100))

        // Type the value character by character
        for (const char of currentValue) {
          searchInput.value += char
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
          searchInput.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
          searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
          searchInput.dispatchEvent(new Event('input', { bubbles: true }))
          searchInput.dispatchEvent(new Event('change', { bubbles: true }))

          await new Promise((r) => setTimeout(r, 50))
        }

        // Step 5: Wait for options to appear and click the first one
        const found = await waitForBambooHROption(currentValue)

        if (found) {
          await new Promise((r) => setTimeout(r, 300))
          cleanup()
        } else {
          // Try next value
          console.log(`[fillBambooHRSelect] No match for "${currentValue}", trying next`)
          await new Promise((r) => setTimeout(r, 300))
          tryNextValue()
        }
      } catch (error) {
        console.error('[fillBambooHRSelect] Error:', error)
        cleanup()
      }
    }

    tryNextValue()
  })
}

const waitForBambooHROption = (
  searchValue: string,
  maxRetries = 20,
  retryCount = 0,
): Promise<boolean> => {
  return new Promise((resolve) => {
    const options = document.querySelectorAll('[role="menuitem"]')

    console.log(
      `[waitForBambooHROption] Retry ${retryCount}/${maxRetries} - Found ${options.length} options`,
    )

    if (options.length === 0) {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          resolve(waitForBambooHROption(searchValue, maxRetries, retryCount + 1))
        }, 100)
      } else {
        console.log(`[waitForBambooHROption] FAILED - No options found`)
        resolve(false)
      }
      return
    }

    const normalizedSearch = searchValue.toLowerCase().trim()
    const optionTexts = Array.from(options).map((el) => el.textContent?.trim())
    console.log(`[waitForBambooHROption] Available options:`, optionTexts)
    console.log(`[waitForBambooHROption] Looking for: "${normalizedSearch}"`)

    const match = Array.from(options).find((el) => {
      const text = el.textContent?.toLowerCase().trim() || ''
      return text === normalizedSearch || text.includes(normalizedSearch)
    }) as HTMLElement | undefined

    if (match) {
      console.log(
        `[waitForBambooHROption] SUCCESS - Found and clicking: "${match.textContent?.trim()}"`,
      )
      match.click()
      resolve(true)
    } else {
      const firstOption = options[0] as HTMLElement | undefined
      if (firstOption) {
        console.log(
          `[waitForBambooHROption] No exact match, clicking first option: "${firstOption.textContent?.trim()}"`,
        )
        firstOption.click()
        resolve(true)
      } else {
        if (retryCount < maxRetries) {
          setTimeout(() => {
            resolve(waitForBambooHROption(searchValue, maxRetries, retryCount + 1))
          }, 100)
        } else {
          resolve(false)
        }
      }
    }
  })
}
