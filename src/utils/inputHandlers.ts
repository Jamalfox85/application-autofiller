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

export const fillReactSelect = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  selectId: string,
): void => {
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

  const waitForOptions = (retries = 10) => {
    const options = document.querySelectorAll(selectId)
    if (options.length > 0) {
      const match = Array.from(options).find(
        (el) => el.textContent?.toLowerCase() === value.toLowerCase(),
      ) as HTMLElement | undefined
      const target = (match || options[0]) as HTMLElement
      target?.click()
      input.removeEventListener('blur', handleBlur, true)
    } else if (retries > 0) {
      setTimeout(() => waitForOptions(retries - 1), 200)
    } else {
      input.removeEventListener('blur', handleBlur, true)
    }
  }
  waitForOptions()
}
