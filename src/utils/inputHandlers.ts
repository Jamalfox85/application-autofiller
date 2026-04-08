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
  value: string,
  selectId: string,
): Promise<void> => {
  return new Promise((resolve) => {
    const handleBlur = (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    input.addEventListener('blur', handleBlur, true)

    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    input.focus()
    input.dispatchEvent(new Event('focus', { bubbles: true }))

    for (const char of value) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeInputValueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    const cleanup = () => {
      input.removeEventListener('blur', handleBlur, true)
      resolve()
    }

    const waitForOptions = (retries = 20) => {
      const options = document.querySelectorAll(selectId)
      const isLoading = !!document.querySelector('.select2-searching, .select2-more-results')

      if (options.length > 0 && !isLoading) {
        const match = Array.from(options).find(
          (el) => el.textContent?.trim().toLowerCase() === value.toLowerCase(),
        ) as HTMLElement | undefined
        const target = (match || options[0]) as HTMLElement

        target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        target?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        target?.click()

        cleanup()
      } else if (retries > 0) {
        setTimeout(() => waitForOptions(retries - 1), 300)
      } else {
        cleanup()
      }
    }
    waitForOptions()
  })
}
