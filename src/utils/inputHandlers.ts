import { RELATIVE_MATCHES } from '../utils/relativeMatches.ts'

export async function fillNativeInput(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  input.dispatchEvent(new Event('focus', { bubbles: true }))

  // Type character by character
  for (const char of value) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    nativeSetter?.call(input, input.value + char)
    input.dispatchEvent(new Event('input', { bubbles: true }))
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
  //   // Find the React fiber instance on the input element
  //   const reactFiberKey = Object.keys(input).find(
  //     (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'),
  //   )
  const reactPropsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'))

  const reactProps = reactPropsKey ? (input as any)[reactPropsKey] : null

  // If we can find React's onChange handler, use it directly
  if (reactProps?.onChange) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      'value',
    )?.set

    input.focus()
    nativeSetter?.call(input, value)

    // Simulate a React synthetic event
    const syntheticEvent = new Event('input', { bubbles: true })
    Object.defineProperty(syntheticEvent, 'target', { writable: false, value: input })
    reactProps.onChange(syntheticEvent)

    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    return
  }

  // Fallback: set full value at once rather than char by char
  const nativeSetter = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype,
    'value',
  )?.set

  input.dispatchEvent(new Event('focus', { bubbles: true }))
  nativeSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
}

export const fillReactSelect = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string | string[],
  selectId?: string, // Now optional
): Promise<void> => {
  return new Promise((resolve) => {
    const values = Array.isArray(value) ? value : [value]
    let currentValueIndex = 0

    const cleanup = () => {
      input.blur()
      resolve()
    }

    const tryNextValue = async () => {
      if (currentValueIndex >= values.length) {
        cleanup()
        return
      }

      const currentValue = values[currentValueIndex]
      currentValueIndex++

      console.log(`[fillReactSelect] Attempting: "${currentValue}"`)

      try {
        // Focus and open the dropdown
        input.focus()
        input.click()
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

        // Wait for dropdown to render
        await new Promise((r) => setTimeout(r, 300))

        // Type the value character by character
        for (const char of currentValue) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set
          nativeInputValueSetter?.call(input, input.value + char)

          input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
          input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
          input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))

          await new Promise((r) => setTimeout(r, 50))
        }

        // Wait for options to appear and find a match
        const found = await waitForOptionMatch(input, currentValue)

        if (found) {
          // Give a moment for the selection to register
          await new Promise((r) => setTimeout(r, 300))
          cleanup()
        } else {
          // Clear input and try next value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set
          nativeInputValueSetter?.call(input, '')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          input.blur()

          await new Promise((r) => setTimeout(r, 500))
          tryNextValue()
        }
      } catch (error) {
        console.error('[fillReactSelect] Error:', error)
        cleanup()
      }
    }

    tryNextValue()
  })
}

const waitForOptionMatch = (
  input: HTMLInputElement,
  searchValue: string,
  maxRetries = 25,
  retryCount = 0,
): Promise<boolean> => {
  return new Promise((resolve) => {
    // Find the closest visible listbox to this input
    const findVisibleListbox = (): Element | null => {
      const inputId = input.id

      // Try to find listbox by input ID first
      let listbox = document.getElementById(`react-select-${inputId}-listbox`)
      if (listbox) {
        console.log(`[waitForOptionMatch] Found listbox by ID pattern`)
        return listbox
      }

      // Try any listbox containing the input ID
      listbox = document.querySelector(`[id*="${inputId}"][role="listbox"]`)
      if (listbox) {
        console.log(`[waitForOptionMatch] Found listbox by ID contains pattern`)
        return listbox
      }

      // Find any visible listbox on the page
      const allListboxes = document.querySelectorAll('[role="listbox"]')
      for (const lb of allListboxes) {
        const rect = lb.getBoundingClientRect()
        const style = window.getComputedStyle(lb)
        if (
          rect.height > 0 &&
          rect.width > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        ) {
          console.log(`[waitForOptionMatch] Found visible listbox`)
          return lb
        }
      }

      return null
    }

    const listbox = findVisibleListbox()
    let options: Element[] = []

    if (listbox) {
      options = Array.from(listbox.querySelectorAll('[role="option"]'))
      console.log(`[waitForOptionMatch] Listbox contains ${options.length} options`)
    }

    console.log(
      `[waitForOptionMatch] Retry ${retryCount}/${maxRetries} - Found ${options.length} options`,
    )

    if (options.length === 0) {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          resolve(waitForOptionMatch(input, searchValue, maxRetries, retryCount + 1))
        }, 100)
      } else {
        console.log(`[waitForOptionMatch] FAILED - No options found after ${maxRetries} retries`)
        resolve(false)
      }
      return
    }

    const normalizedSearch = searchValue.toLowerCase().trim()
    const optionTexts = Array.from(options).map((el) => el.textContent?.trim())
    console.log(`[waitForOptionMatch] Available options:`, optionTexts)
    console.log(`[waitForOptionMatch] Looking for: "${normalizedSearch}"`)

    // Find match (exact match first, then partial match)
    const match = Array.from(options).find((el) => {
      const text = el.textContent?.toLowerCase().trim() || ''
      return text === normalizedSearch || text.includes(normalizedSearch)
    }) as HTMLElement | undefined

    if (match) {
      console.log(
        `[waitForOptionMatch] SUCCESS - Found and clicking: "${match.textContent?.trim()}"`,
      )
      match.click()
      resolve(true)
    } else {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          resolve(waitForOptionMatch(input, searchValue, maxRetries, retryCount + 1))
        }, 100)
      } else {
        console.log(
          `[waitForOptionMatch] FAILED - No match found for "${normalizedSearch}" after ${maxRetries} retries`,
        )
        resolve(false)
      }
    }
  })
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
