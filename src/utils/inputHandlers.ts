import { RELATIVE_MATCHES } from '../utils/relativeMatches.ts'
import { bestOptionIndex } from './optionMatch.ts'
import { coerceFillText } from './fillValue.ts'
import { bambooOwnedMenu, chooseBambooOptionText } from './siteRules/bamboohrFields.ts'

type ReactTrackedField = (HTMLInputElement | HTMLTextAreaElement) & {
  _valueTracker?: { setValue: (value: string) => void }
}

// React 16+ ignores a native value write unless the value tracker is reset first.
// Greenhouse text fields and react-select search boxes are controlled inputs, so a
// plain `input.value = …` plus an input event never reaches the component.
export function setReactInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const view = input.ownerDocument?.defaultView ?? window
  const proto =
    input.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  const previous = input.value
  setter?.call(input, value)
  const tracker = (input as ReactTrackedField)._valueTracker
  if (tracker) tracker.setValue(previous)
  const InputEventCtor = view.InputEvent ?? InputEvent
  input.dispatchEvent(new InputEventCtor('input', { bubbles: true, data: value, inputType: 'insertText' }))
}

export async function fillNativeInput(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: unknown,
): Promise<boolean> {
  const text = coerceFillText(value)
  if (!text) return false
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false

  input.focus()
  input.dispatchEvent(new Event('focus', { bubbles: true }))

  let current = ''
  for (const char of text) {
    current += char
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    setReactInputValue(input, current)
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

export async function fillWorkdayInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  try {
    input.focus()
    // Workday apply fields are React controlled inputs. A plain value write
    // never reaches the component unless the value tracker is reset first.
    setReactInputValue(input, value)
    // JSDOM nodes live in a different realm than the Node Event constructor.
    const EventCtor = input.ownerDocument?.defaultView?.Event ?? Event
    input.dispatchEvent(new EventCtor('change', { bubbles: true, composed: true }))
    input.dispatchEvent(new EventCtor('blur', { bubbles: true, composed: true }))
  } catch (error) {
    console.error('Error filling input:', error)
  }
}

// My Information text fields are uncontrolled. Workday copies the DOM value
// into form state on blur. React 17+ listens for focusout, not blur, so the
// text can be visible while validation still says the field is empty.
export function commitWorkdayTextValue(input: HTMLInputElement | HTMLTextAreaElement) {
  const view = input.ownerDocument?.defaultView
  const FocusEventCtor = view?.FocusEvent ?? FocusEvent
  input.dispatchEvent(new FocusEventCtor('focusout', { bubbles: true, composed: true }))
}

// Chooses one visible option label to click, or null to keep waiting / try the next query.
// Greenhouse uses this so a dialing-code or location list isn't accepted on the first
// substring hit (for example "San Francisco, Cebu, Philippines").
export type ReactSelectOptionPicker = (optionTexts: string[]) => string | null

// 'greenhouse' opens the job-board menu (mouseup / ArrowDown). Employment month
// and year, education, work-auth, location, dialing code, and state questions pass
// that mode. Ashby and Lever stay on the default path.
export type ReactSelectOpenMode = 'default' | 'greenhouse'

export const fillReactSelect = async (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string | string[],
  selectId?: string,
  pickOption?: ReactSelectOptionPicker,
  openMode: ReactSelectOpenMode = 'default',
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
      if (openMode === 'greenhouse') {
        // Work-authorization question_* menus are a static list. Read them before
        // typing so "Yes" does not hide a sentence such as "for any employer".
        // School and degree catalogs must receive the query before the menu opens,
        // or the first fetch is the alphabetical A-page (Alverno College).
        const questionMenu = /question_\d+/.test(input.id)
        if (questionMenu && pickOption) {
          input.focus()
          openGreenhouseMenu(input)
          await delay(150)
          if (commitOwnedOption(input, selectId, pickOption)) {
            await delay(200)
            return true
          }
        }
        input.focus()
        setReactInputValue(input, currentValue)
        openGreenhouseMenu(input)
      } else {
        openReactSelect(input)
        await delay(150)
        // Read the open menu before typing. A short query such as "Yes" filters
        // out sentence options that do not contain that word (work authorization
        // on SpaceX), and the combobox stays blank.
        if (pickOption && commitOwnedOption(input, selectId, pickOption)) {
          await delay(200)
          return true
        }
        setReactInputValue(input, '')
        setReactInputValue(input, currentValue)
      }
      if (openMode === 'greenhouse') await delay(150)

      // School search is async (Greenhouse debounceTimeout is 300ms) and the menu
      // reads "No options" until that request returns. Aborting on the first empty
      // paint types the next query — including the raw profile string — and a late
      // catalog row then counts as success while that typed string is still visible.
      const found = await waitForOptionMatch(
        input,
        currentValue,
        selectId,
        pickOption,
        40,
        0,
        -1,
        0,
        openMode === 'greenhouse' ? 8 : 0,
      )
      if (found) {
        await delay(200)
        // commitReactOption only dispatches events. If nothing applies the row,
        // the input still shows the query that was just typed. That query may be
        // the raw profile string, so a no-op click must not count as success.
        if (comboboxShowsOption(input, found)) return true
      }

      setReactInputValue(input, '')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } catch (error) {
      console.error('[fillReactSelect] Error:', error)
      closeReactSelectMenu(input)
      return false
    }
  }

  // Every query failed to settle. Drop a trailing typed query so the field cannot
  // keep "The University of Texas at Austin" after the catalog attempt missed.
  if (input.value.trim() && input.value.trim() !== values[0]) setReactInputValue(input, '')
  closeReactSelectMenu(input)
  return false
}

// A failed fill must not leave the menu hanging open on "No options". input.blur() alone does
// nothing when the page is not focused (the usual case for a content script), so also send
// Escape and the blur/focusout events react-select listens for, and toggle the flyout closed
// if the menu is still expanded.
export function closeReactSelectMenu(input: HTMLInputElement) {
  try {
    if (input.value) setReactInputValue(input, '')
    const keyInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }
    input.dispatchEvent(new KeyboardEvent('keydown', keyInit))
    input.dispatchEvent(new KeyboardEvent('keyup', keyInit))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: false }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    input.blur()
    if (input.getAttribute('aria-expanded') === 'true') {
      const root = input.closest('.select') || input.parentElement
      const toggle = root?.querySelector<HTMLElement>('button[aria-label="Toggle flyout"]')
      toggle?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
    }
  } catch {
    // Best effort: the fill already failed.
  }
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

// Job-board selects keep menuIsOpen in React state. The flyout button preventDefault's
// click; the menu toggles on mouseup of the control and on ArrowDown keyup.
function openGreenhouseMenu(input: HTMLInputElement) {
  if (input.getAttribute('aria-expanded') === 'true') return
  const root = input.closest('.select') || input.parentElement
  const toggle = root?.querySelector<HTMLElement>('button[aria-label="Toggle flyout"]')
  toggle?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  if (input.getAttribute('aria-expanded') === 'true') return
  input.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }),
  )
}

// react-select commits an option on mousedown (click alone runs after blur and is dropped).
function commitReactOption(option: HTMLElement) {
  const eventInit: MouseEventInit = { bubbles: true, cancelable: true, view: window }
  option.dispatchEvent(new MouseEvent('mousedown', eventInit))
  option.dispatchEvent(new MouseEvent('mouseup', eventInit))
  option.click()
}

// The visible school value is the search text while it is non-empty (that is what
// #school--0 shows). A closed selection lives in .select__single-value only after
// the input has been cleared. Neither is settled until it equals the chosen option.
function comboboxShowsOption(input: HTMLInputElement, chosen: string): boolean {
  const wanted = chosen.replace(/\s+/g, ' ').trim()
  if (!wanted) return false
  const typed = input.value.replace(/\s+/g, ' ').trim()
  if (typed) return typed === wanted
  const single = input.closest('.select')?.querySelector('.select__single-value')
  const label = (single?.textContent || '').replace(/\s+/g, ' ').trim()
  return label === wanted
}

// Search text sitting in a react-select input is not a committed answer. Greenhouse
// shows the selection in .select__single-value and clears the input. A prior pass that
// only typed the profile school name must be filled again.
export function comboboxSearchIsUncommitted(input: HTMLElement): boolean {
  if (!(input instanceof HTMLInputElement)) return false
  if (input.getAttribute('role') !== 'combobox') return false
  const typed = input.value.trim()
  if (!typed) return false
  const label =
    input.closest('.select')?.querySelector('.select__single-value')?.textContent?.replace(/\s+/g, ' ').trim() ||
    ''
  return typed !== label
}

function optionLabel(el: Element) {
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

const waitForOptionMatch = (
  input: HTMLInputElement,
  searchValue: string,
  selectId?: string,
  pickOption?: ReactSelectOptionPicker,
  maxRetries = 40,
  retryCount = 0,
  optionsSeenAt = -1,
  noOptionsStreak = 0,
  // Greenhouse education search paints "No options" during the debounce. Ignore
  // that until this many polls have elapsed (~100ms each, after the initial wait)
  // so the catalog row can land before the next query is typed.
  noOptionsMinRetry = 0,
): Promise<string | false> => {
  return new Promise((resolve) => {
    const options = collectReactOptions(input, selectId).filter(
      (option) => !isPlaceholderOption(option.textContent || ''),
    )
    const match = pickOption
      ? matchPickedOption(options, pickOption)
      : matchBestOption(options, searchValue)

    if (match instanceof HTMLElement) {
      const label = optionLabel(match)
      commitReactOption(match)
      resolve(label)
      return
    }

    // "No options" means this query filtered the menu empty. Move on to the next
    // search string. A still-empty menu (school/city typeahead) keeps polling.
    // A menu that has not had time to replace the initial empty paint is not empty.
    const nextNoOptionsStreak = ownedMenuHasNoOptions(input) ? noOptionsStreak + 1 : 0
    if (nextNoOptionsStreak >= 3 && retryCount >= noOptionsMinRetry) {
      resolve(false)
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
          waitForOptionMatch(
            input,
            searchValue,
            selectId,
            pickOption,
            maxRetries,
            retryCount + 1,
            seenAt,
            nextNoOptionsStreak,
            noOptionsMinRetry,
          ),
        )
      }, 100)
      return
    }

    resolve(false)
  })
}

// Options that belong to this combobox. Skips another field's open listbox, which
// findVisibleListbox() would otherwise return before this menu has mounted.
function collectOwnedReactOptions(input: HTMLInputElement, selectId?: string): HTMLElement[] {
  const inputId = input.id
  const listbox =
    (inputId && document.getElementById(`react-select-${inputId}-listbox`)) ||
    (inputId && document.querySelector(`[role="listbox"][id*="${CSS.escape(inputId)}"]`))

  const fromListbox = listbox
    ? Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
    : []
  if (fromListbox.length > 0) return fromListbox

  if (selectId) {
    return Array.from(document.querySelectorAll<HTMLElement>(selectId))
  }
  return []
}

function commitOwnedOption(
  input: HTMLInputElement,
  selectId: string | undefined,
  pickOption: ReactSelectOptionPicker,
): boolean {
  const options = collectOwnedReactOptions(input, selectId).filter(
    (option) => !isPlaceholderOption(option.textContent || ''),
  )
  const match = matchPickedOption(options, pickOption)
  if (!(match instanceof HTMLElement)) return false
  commitReactOption(match)
  return true
}

function ownedMenuHasNoOptions(input: HTMLInputElement): boolean {
  const inputId = input.id
  const listbox = inputId ? document.getElementById(`react-select-${inputId}-listbox`) : null
  const menu = listbox?.closest('.select__menu') || listbox
  if (!menu) return false
  const text = (menu.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return text === 'no options'
}

function matchBestOption(options: HTMLElement[], searchValue: string) {
  if (options.length === 0) return undefined
  const optionIndex = bestOptionIndex(
    options.map((option) => option.textContent?.trim() || ''),
    searchValue,
  )
  return optionIndex >= 0 ? options[optionIndex] : undefined
}

function matchPickedOption(options: HTMLElement[], pickOption: ReactSelectOptionPicker) {
  if (options.length === 0) return undefined
  const chosen = pickOption(options.map((option) => optionLabel(option)))
  if (!chosen) return undefined
  return options.find((option) => optionLabel(option) === chosen)
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
// When set, chooses one visible menu label. Callers pass the country or state
// picker. There is no first-row fallback: that clicked Uganda on the country list.
export type BambooMenuPicker = (optionTexts: string[]) => string | null

let bambooSelectChain: Promise<void> = Promise.resolve()

function bambooDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function bambooKey(target: Element, type: string, key: string) {
  const View = target.ownerDocument?.defaultView
  const Ctor = View?.KeyboardEvent ?? KeyboardEvent
  return new Ctor(type, {
    key,
    code: key === 'Enter' ? 'Enter' : key,
    bubbles: true,
    cancelable: true,
  })
}

function bambooInputEvent(target: Element, type: string) {
  const View = target.ownerDocument?.defaultView
  const Ctor = View?.Event ?? Event
  return new Ctor(type, { bubbles: true })
}

function bambooClick(target: Element) {
  const View = target.ownerDocument?.defaultView
  const Ctor = View?.MouseEvent ?? MouseEvent
  target.dispatchEvent(new Ctor('click', { bubbles: true, cancelable: true }))
}

function dismissOtherBambooMenus(toggle: HTMLElement) {
  const doc = toggle.ownerDocument
  if (!doc) return
  const open = doc.querySelectorAll('button.fab-SelectToggle[aria-expanded="true"]')
  for (const button of Array.from(open)) {
    if (button === toggle) continue
    button.dispatchEvent(bambooKey(button, 'keydown', 'Escape'))
  }
}

function bambooMenuReady(menu: HTMLElement): boolean {
  return !!menu.querySelector('input.fab-MenuSearch__input, [role="menuitem"]')
}

async function openBambooMenu(toggle: HTMLButtonElement): Promise<HTMLElement | null> {
  // Close any other Fabric menu first. The country list stays mounted at the
  // top of the document, and a later state fill used to type into it.
  dismissOtherBambooMenus(toggle)
  const existing = bambooOwnedMenu(toggle)
  if (existing) {
    if (bambooMenuReady(existing)) return existing
    for (let attempt = 0; attempt < 30; attempt++) {
      await bambooDelay(100)
      const menu = bambooOwnedMenu(toggle)
      if (menu && bambooMenuReady(menu)) return menu
    }
    return null
  }

  // Fabric opens this menu on a click. Enter leaves aria-expanded false, so the
  // province and country toggles never reveal their options.
  console.log('[fillBambooHRSelect] Focusing select button')
  toggle.focus()
  bambooClick(toggle)

  for (let attempt = 0; attempt < 10; attempt++) {
    const menu = bambooOwnedMenu(toggle)
    if (menu && bambooMenuReady(menu)) return menu
    await bambooDelay(50)
  }

  console.log('[fillBambooHRSelect] Pressing Enter to open dropdown')
  toggle.dispatchEvent(bambooKey(toggle, 'keydown', 'Enter'))
  toggle.dispatchEvent(bambooKey(toggle, 'keyup', 'Enter'))

  for (let attempt = 0; attempt < 30; attempt++) {
    const menu = bambooOwnedMenu(toggle)
    if (
      menu &&
      (menu.querySelector('input.fab-MenuSearch__input') || menu.querySelector('[role="menuitem"]'))
    ) {
      return menu
    }
    await bambooDelay(100)
  }
  return null
}

export const fillBambooHRSelect = (
  selectButton: HTMLButtonElement,
  value: string | string[],
  pick?: BambooMenuPicker,
): Promise<void> => {
  const job = bambooSelectChain.then(() => fillBambooHRSelectNow(selectButton, value, pick))
  bambooSelectChain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

const fillBambooHRSelectNow = (
  selectButton: HTMLButtonElement,
  value: string | string[],
  pick?: BambooMenuPicker,
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
        const menu = await openBambooMenu(selectButton)
        if (!menu) {
          console.log('[fillBambooHRSelect] Search input never appeared')
          await bambooDelay(300)
          tryNextValue()
          return
        }

        const searchInput = menu.querySelector('input.fab-MenuSearch__input') as HTMLInputElement | null
        if (searchInput) {
          console.log('[fillBambooHRSelect] Search input found, typing value')
          searchInput.focus()
          searchInput.value = ''
          searchInput.dispatchEvent(bambooInputEvent(searchInput, 'input'))
          searchInput.dispatchEvent(bambooInputEvent(searchInput, 'change'))
          await bambooDelay(100)

          for (const char of currentValue) {
            searchInput.value += char
            searchInput.dispatchEvent(bambooKey(searchInput, 'keydown', char))
            searchInput.dispatchEvent(bambooKey(searchInput, 'keypress', char))
            searchInput.dispatchEvent(bambooKey(searchInput, 'keyup', char))
            searchInput.dispatchEvent(bambooInputEvent(searchInput, 'input'))
            searchInput.dispatchEvent(bambooInputEvent(searchInput, 'change'))
            await bambooDelay(50)
          }
        }

        const found = await waitForBambooHROption(menu, currentValue, 20, 0, pick)

        if (found) {
          await bambooDelay(300)
          cleanup()
        } else {
          console.log(`[fillBambooHRSelect] No match for "${currentValue}", trying next`)
          await bambooDelay(300)
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
  menu: HTMLElement,
  searchValue: string,
  maxRetries = 20,
  retryCount = 0,
  pick?: BambooMenuPicker,
): Promise<boolean> => {
  return new Promise((resolve) => {
    const options = menu.querySelectorAll('[role="menuitem"]')

    console.log(
      `[waitForBambooHROption] Retry ${retryCount}/${maxRetries} - Found ${options.length} options`,
    )

    const retryLater = () => {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          resolve(waitForBambooHROption(menu, searchValue, maxRetries, retryCount + 1, pick))
        }, 100)
        return
      }
      resolve(false)
    }

    if (options.length === 0) {
      if (retryCount >= maxRetries) console.log(`[waitForBambooHROption] FAILED - No options found`)
      retryLater()
      return
    }

    const optionTexts = Array.from(options).map((el) => el.textContent?.trim() || '')
    console.log(`[waitForBambooHROption] Available options:`, optionTexts)

    const chosen = pick ? pick(optionTexts) : chooseBambooOptionText(optionTexts, searchValue)
    const wanted = chosen?.trim().toLowerCase() || ''
    const picked = wanted
      ? (Array.from(options).find((el) => (el.textContent?.trim().toLowerCase() || '') === wanted) as
          | HTMLElement
          | undefined)
      : undefined
    if (picked) {
      console.log(`[waitForBambooHROption] SUCCESS - Picked: "${picked.textContent?.trim()}"`)
      picked.click()
      resolve(true)
      return
    }
    // Do not click the first row. On the country menu that row is another
    // country (Uganda, when the list is windowed next to United States).
    retryLater()
  })
}
