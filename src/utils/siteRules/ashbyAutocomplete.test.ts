import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'

const html = readFileSync(new URL('../../../fixtures/pages/ashby-location.html', import.meta.url), 'utf8')
const dom = new JSDOM(html, { url: 'https://jobs.ashbyhq.com/meridianlink/job/application' })
const view = dom.window
const globals = [
  'window',
  'document',
  'KeyboardEvent',
  'FocusEvent',
  'MouseEvent',
  'InputEvent',
  'Event',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLButtonElement',
] as const
for (const key of globals) {
  Object.defineProperty(globalThis, key, {
    value: key === 'window' ? view : (view as unknown as Record<string, unknown>)[key],
    configurable: true,
    writable: true,
  })
}

const { default: ashbyConfig, setAshbyAutocompleteTimingForTests } = await import('./ashby.ts')

setAshbyAutocompleteTimingForTests({ suggestionTimeoutMs: 80, verifyDelayMs: 15, typeDelayMs: 0 })
after(() => setAshbyAutocompleteTimingForTests(null))

const doc = view.document
const rule = ashbyConfig()

const PHILADELPHIA = [
  'Philadelphia, Mississippi, United States',
  'Philadelphia, Pennsylvania, United States',
  'Philadelphia, New York, United States',
]

function installTypeahead(input: HTMLInputElement, optionsFor: (query: string) => string[]) {
  const list = doc.createElement('div')
  list.id = `list-${input.getAttribute('placeholder') || 'field'}`.replace(/\s+/g, '-')
  list.setAttribute('role', 'listbox')
  list.hidden = true
  doc.body.append(list)
  let active = 0
  let timer = 0

  const hide = () => {
    list.hidden = true
    list.replaceChildren()
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-controls')
  }

  const choose = (option: HTMLElement, via: 'click' | 'enter') => {
    if (via === 'click' && input.dataset.rejectClicks === '1') {
      input.value = option.textContent || ''
      hide()
      input.focus()
      return
    }
    input.value = option.textContent || ''
    input.dataset.committed = input.value
    const entry = input.closest('[data-field-path]')
    const alert = entry?.querySelector<HTMLElement>('[role="alert"]')
    if (input.dataset.forceInvalid === '1') {
      input.setAttribute('aria-invalid', 'true')
      if (alert) {
        alert.hidden = false
        alert.textContent = 'Select a location from the list'
      }
    }
    hide()
  }

  const show = (query: string) => {
    const labels = optionsFor(query)
    list.replaceChildren()
    if (labels.length === 0) {
      hide()
      return
    }
    active = 0
    labels.forEach((label, index) => {
      const option = doc.createElement('div')
      option.setAttribute('role', 'option')
      option.textContent = label
      option.setAttribute('aria-selected', index === 0 ? 'true' : 'false')
      option.addEventListener('click', () => choose(option, 'click'))
      list.append(option)
    })
    list.hidden = false
    input.setAttribute('aria-expanded', 'true')
    input.setAttribute('aria-controls', list.id)
  }

  input.addEventListener('input', () => {
    view.clearTimeout(timer)
    timer = view.setTimeout(() => show(input.value), 10)
  })
  input.addEventListener('blur', () => {
    hide()
    const entry = input.closest('[data-field-path]')
    const alert = entry?.querySelector<HTMLElement>('[role="alert"]')
    if ((input.dataset.committed || '') !== input.value.trim()) {
      input.value = ''
      input.removeAttribute('aria-invalid')
      if (alert) {
        alert.hidden = true
        alert.textContent = ''
      }
    }
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide()
      return
    }
    if (input.getAttribute('aria-expanded') !== 'true') return
    const options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'))
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      active = Math.min(options.length - 1, active + 1)
      options.forEach((option, index) => option.setAttribute('aria-selected', index === active ? 'true' : 'false'))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const option = options[active]
      if (option) choose(option, 'enter')
    }
  })
}

function resetCombobox(input: HTMLInputElement) {
  input.value = ''
  delete input.dataset.committed
  delete input.dataset.rejectClicks
  delete input.dataset.forceInvalid
  input.removeAttribute('aria-invalid')
  input.setAttribute('aria-expanded', 'false')
  const alert = input.closest('[data-field-path]')?.querySelector<HTMLElement>('[role="alert"]')
  if (alert) {
    alert.hidden = true
    alert.textContent = ''
  }
}

const locationInput = doc.querySelector('[data-field-path="location"] input') as HTMLInputElement
const schoolInput = doc.querySelector(
  '[data-field-path="_systemfield_education_history"] input',
) as HTMLInputElement

installTypeahead(locationInput, (query) => {
  const text = query.toLowerCase()
  if (!text.includes('phil') && !text.includes('penn')) return []
  return PHILADELPHIA
})
installTypeahead(schoolInput, (query) => {
  if (!query.toLowerCase().includes('berkeley')) return []
  return ['Berkeley College', 'University of California, Berkeley']
})

for (const button of Array.from(doc.querySelectorAll<HTMLButtonElement>('button[data-option]'))) {
  button.addEventListener('click', () => {
    const group = button.parentElement
    if (!group) return
    for (const peer of Array.from(group.querySelectorAll('button'))) peer.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-pressed', 'true')
    const box = group.querySelector<HTMLInputElement>('input')
    if (box) box.checked = true
  })
}

const philadelphia = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '2155550100',
  city: 'Philadelphia',
  state: 'Pennsylvania',
  country: 'united_states',
} as PersonalInfo

function checkbox(name: string) {
  return doc.querySelector(`input[name="${name}"]`) as HTMLInputElement
}

function pressed(name: string, choice: string) {
  return checkbox(name)
    .closest('[data-field-path]')
    ?.querySelector(`button[data-option="${choice}"]`)
    ?.getAttribute('aria-pressed')
}

describe('Ashby location and school typeahead', () => {
  it('commits Philadelphia, Pennsylvania and leaves the Mississippi row alone', async () => {
    resetCombobox(locationInput)
    const filled = await rule.apply(locationInput, '', philadelphia)
    assert.equal(filled, true)
    assert.equal(locationInput.value, 'Philadelphia, Pennsylvania, United States')
    assert.equal(locationInput.dataset.committed, 'Philadelphia, Pennsylvania, United States')
    assert.equal(locationInput.getAttribute('aria-expanded'), 'false')
    assert.notEqual(doc.activeElement, locationInput)
    const alert = locationInput.closest('[data-field-path]')?.querySelector('[role="alert"]')
    assert.equal((alert as HTMLElement).hidden, true)
  })

  it('retries once with the keyboard when a click only leaves the suggestion text', async () => {
    resetCombobox(locationInput)
    locationInput.dataset.rejectClicks = '1'
    const filled = await rule.apply(locationInput, '', philadelphia)
    assert.equal(filled, true)
    assert.equal(locationInput.dataset.committed, 'Philadelphia, Pennsylvania, United States')
    assert.equal(locationInput.value, 'Philadelphia, Pennsylvania, United States')
    assert.notEqual(doc.activeElement, locationInput)
  })

  it('clears the combobox when no suggestion appears', async () => {
    resetCombobox(locationInput)
    const filled = await rule.apply(locationInput, '', {
      city: 'Nowhereville',
      state: 'ZZ',
      country: 'narnia',
    } as PersonalInfo)
    assert.equal(filled, false)
    assert.equal(locationInput.value, '')
    assert.equal(locationInput.dataset.committed, undefined)
  })

  it('does not keep a match that still shows a validation error', async () => {
    resetCombobox(locationInput)
    locationInput.dataset.forceInvalid = '1'
    const filled = await rule.apply(locationInput, '', philadelphia)
    assert.equal(filled, false)
    assert.equal(locationInput.value, '')
    assert.notEqual(locationInput.getAttribute('aria-invalid'), 'true')
    const alert = locationInput.closest('[data-field-path]')?.querySelector('[role="alert"]')
    assert.equal((alert?.textContent || '').trim(), '')
  })

  it('commits a school typeahead the same way', async () => {
    resetCombobox(schoolInput)
    const filled = await rule.apply(schoolInput, '', {
      education: [{ schoolName: 'University of California, Berkeley' }],
    } as PersonalInfo)
    assert.equal(filled, true)
    assert.equal(schoolInput.value, 'University of California, Berkeley')
    assert.equal(schoolInput.dataset.committed, 'University of California, Berkeley')
  })
})

describe('Ashby yes/no buttons', () => {
  it('presses age and sponsorship when the profile has those answers, and leaves the others alone', async () => {
    const filled = await rule.apply(checkbox('age-18'), '', {
      age18OrOlder: 'yes',
      sponsorshipRequired: 'No',
      workAuthorization: 'us_citizen',
      disabilityStatus: 'no',
    } as PersonalInfo)
    assert.equal(filled, true)
    assert.equal(pressed('age-18', 'yes'), 'true')
    assert.equal(pressed('age-18', 'no'), 'false')

    assert.equal(
      await rule.apply(checkbox('sponsorship'), '', {
        sponsorshipRequired: 'No',
        workAuthorization: 'us_citizen',
      } as PersonalInfo),
      true,
    )
    assert.equal(pressed('sponsorship', 'no'), 'true')
    assert.equal(pressed('sponsorship', 'yes'), 'false')

    assert.equal(
      await rule.apply(checkbox('contact-current'), '', {
        workAuthorization: 'us_citizen',
        sponsorshipRequired: 'No',
      } as PersonalInfo),
      false,
    )
    assert.equal(pressed('contact-current', 'yes'), 'false')
    assert.equal(pressed('contact-current', 'no'), 'false')

    assert.equal(
      await rule.apply(checkbox('essential'), '', {
        disabilityStatus: 'no',
        workAuthorization: 'us_citizen',
      } as PersonalInfo),
      false,
    )
    assert.equal(pressed('essential', 'yes'), 'false')
    assert.equal(pressed('essential', 'no'), 'false')
  })

  it('leaves age and sponsorship unselected when those profile values are null', async () => {
    for (const button of Array.from(doc.querySelectorAll('button[data-option]'))) {
      button.setAttribute('aria-pressed', 'false')
    }
    for (const box of [checkbox('age-18'), checkbox('sponsorship')]) box.checked = false
    const empty = { age18OrOlder: null, workAuthorization: null, sponsorshipRequired: null } as PersonalInfo
    assert.equal(await rule.apply(checkbox('age-18'), '', empty), false)
    assert.equal(pressed('age-18', 'yes'), 'false')
    assert.equal(pressed('age-18', 'no'), 'false')
    assert.equal(await rule.apply(checkbox('sponsorship'), '', empty), false)
    assert.equal(pressed('sponsorship', 'yes'), 'false')
    assert.equal(pressed('sponsorship', 'no'), 'false')
  })
})
