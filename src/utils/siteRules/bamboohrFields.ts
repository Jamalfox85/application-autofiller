// BambooHR address country is a Fabric select. The posting default (Norway on an
// Oslo job, value 161) is already selected, and the real choices live in the
// menu, not in the hidden <select>. Profile countries are snake_case keys.

export function bambooCountryLabel(country?: string | null): string | null {
  const raw = (country ?? '').trim()
  if (!raw) return null
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (key === 'united_states' || key === 'unitedstates' || key === 'us' || key === 'usa') {
    return 'United States'
  }
  return null
}

// Picks the profile country from the open menu. A different current value
// (Norway, or the id "161") does not win when United States is also listed.
export function pickBambooCountryOption(
  optionTexts: string[],
  currentValue: string,
  profileCountry?: string | null,
): string | null {
  const label = bambooCountryLabel(profileCountry)
  if (!label) return null
  const wanted = label.toLowerCase()
  const exact = optionTexts.map((text) => text.trim()).find((text) => text.toLowerCase() === wanted)
  if (!exact) return null
  // The posting default (Norway, or id 161) is currentValue. The profile option replaces it.
  const current = currentValue.trim().toLowerCase()
  if (current === exact.toLowerCase()) return exact
  return exact
}

type CountryControl = {
  name?: string
  id?: string
  type?: string
}

// The address country widget is <select name="countryId.value">. State, college,
// and yes/no questions are not this control.
export function isBambooCountryControl(input: CountryControl): boolean {
  const type = (input.type || '').toLowerCase()
  if (type === 'hidden' || type === 'file' || type === 'radio' || type === 'checkbox') return false
  const name = (input.name || '').toLowerCase()
  const id = (input.id || '').toLowerCase()
  return name.includes('countryid') || id.includes('countryid')
}

// The visible Fabric toggle, not the clear button that sits beside it.
export function bambooSelectToggle(input: Element): HTMLButtonElement | null {
  const root = input.closest('.fab-Select')
  const toggle = root?.querySelector('button.fab-SelectToggle')
  if (toggle && toggle.tagName === 'BUTTON') return toggle as HTMLButtonElement
  return null
}

export function bambooToggleLabel(toggle: Element): string {
  const content = toggle.querySelector('.fab-SelectToggle__content')?.textContent?.trim()
  if (content) return content
  const aria = toggle.getAttribute('aria-label')?.trim() || ''
  return aria.replace(/^country\s+/i, '').trim()
}
