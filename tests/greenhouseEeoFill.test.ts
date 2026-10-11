import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { JSDOM } from 'jsdom'

const DECLINE = "i don't wish to answer"
const NO_DISABILITY = 'No, I do not have a disability and have not had one in the past'

function installDom(dom: JSDOM) {
  const win = dom.window as unknown as typeof globalThis & Window
  const assign = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  assign('window', win)
  assign('document', win.document)
  assign('HTMLElement', win.HTMLElement)
  assign('HTMLInputElement', win.HTMLInputElement)
  assign('HTMLTextAreaElement', win.HTMLTextAreaElement)
  assign('HTMLSelectElement', win.HTMLSelectElement)
  assign('Element', win.Element)
  assign('Node', win.Node)
  assign('Event', win.Event)
  assign('InputEvent', win.InputEvent)
  assign('MouseEvent', win.MouseEvent)
  assign('KeyboardEvent', win.KeyboardEvent)
  assign('FocusEvent', win.FocusEvent)
  assign('getComputedStyle', win.getComputedStyle.bind(win))
}

function mount() {
  const html = readFileSync(new URL('../fixtures/gh-eeo-select-form.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://job-boards.example/apply' })
  installDom(dom)
  return dom
}

function norm(value: string): string {
  return value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function selectedLabel(input: HTMLElement): string {
  const single = input.closest('.select')?.querySelector('.select__single-value')
  return (single?.textContent || '').replace(/\s+/g, ' ').trim()
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const saved = {
  eeoAnswersEnabled: true,
  gender: 'male',
  raceEthnicity: 'white',
  veteranStatus: 'not_a_veteran',
  disabilityStatus: 'no',
} as never

const filled: Array<[string, string, string]> = [
  ['4033064002', '4033064002gender', 'Male'],
  ['4033065002', '4033065002raceandethnicity', 'White'],
  ['4033066002', '4033066002veteranstatus', 'I am not a protected veteran'],
  ['4033067002', '4033067002disabilitystatus', NO_DISABILITY],
  ['4033068002', '4033068002genderidentityoptional', 'Man'],
]

describe('EEO comboboxes', { concurrency: false }, () => {
test(
  'a fresh page keeps EEO choices after the combobox drops the first click',
  { timeout: 30_000 },
  async () => {
    const dom = mount()
    const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
    const rule = greenhouseConfig()
    const doc = dom.window.document

    for (const [id, text, expected] of filled) {
      const input = doc.getElementById(id) as HTMLInputElement
      const root = input.closest('.select') as HTMLElement
      assert.equal(selectedLabel(input), '', id)
      const result = await rule.apply(input, text, saved)
      assert.equal(result, true, id)
      assert.equal(norm(selectedLabel(input)), norm(expected), id)
      assert.equal(root.dataset.commit, 'keyboard', id)
      assert.notEqual(root.dataset.clicks, '0', id)
      assert.notEqual(root.dataset.wiped, '1', id)
      const hidden = root.querySelector('input[required]') as HTMLInputElement | null
      if (hidden) assert.equal(norm(hidden.value), norm(expected), id)
      await delay(300)
      assert.equal(norm(selectedLabel(input)), norm(expected), `${id} reverted`)
      // A later pass on the same page must not clear a choice that already stuck.
      assert.equal(await rule.apply(input, text, saved), true, id)
      assert.equal(norm(selectedLabel(input)), norm(expected), `${id} cleared on refill`)
    }

    const lgbtq = doc.getElementById('4033070002') as HTMLInputElement
    assert.equal(
      await rule.apply(lgbtq, '4033070002iconsidermyselfamemberofthelgbtqcommunityoptional', saved),
      'skip',
    )
    assert.equal(selectedLabel(lgbtq), '')
  },
)

test(
  'a required EEO dropdown with no saved answer selects the decline option',
  { timeout: 30_000 },
  async () => {
    mount()
    const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
    const { reactSelectEeoFieldHandlers } = await import('../src/utils/siteRules/eeoHandlers.ts')
    const rule = greenhouseConfig()
    const doc = document
    const blank = {
      eeoAnswersEnabled: true,
      gender: '',
      raceEthnicity: '',
      veteranStatus: '',
      disabilityStatus: '',
    } as never

    for (const [id, text] of [
      ['4033064002', '4033064002gender'],
      ['4033065002', '4033065002raceandethnicity'],
      ['4033066002', '4033066002veteranstatus'],
      ['4033067002', '4033067002disabilitystatus'],
    ] as const) {
      const input = doc.getElementById(id) as HTMLInputElement
      assert.equal(await rule.apply(input, text, blank), true, id)
      assert.equal(norm(selectedLabel(input)), DECLINE, id)
      await delay(200)
      assert.equal(norm(selectedLabel(input)), DECLINE, `${id} reverted`)
    }

    for (const [id, text] of [
      ['4033068002', '4033068002genderidentityoptional'],
      ['4033070002', '4033070002iconsidermyselfamemberofthelgbtqcommunityoptional'],
    ] as const) {
      const input = doc.getElementById(id) as HTMLInputElement
      assert.equal(await rule.apply(input, text, blank), 'skip', id)
      assert.equal(selectedLabel(input), '', id)
    }

    const native = doc.createElement('select')
    native.id = 'native-gender'
    native.setAttribute('aria-required', 'true')
    for (const label of ['Select...', 'Male', 'Female', 'I don’t wish to answer']) {
      const option = doc.createElement('option')
      option.value = label === 'Select...' ? '' : label
      option.text = label
      native.append(option)
    }
    doc.body.append(native)
    const gender = reactSelectEeoFieldHandlers.find((entry) => entry.match(native, 'gender'))
    assert.ok(gender)
    assert.equal(await gender.handle(native, 'gender', blank, ''), true)
    assert.equal(norm(native.selectedOptions[0]?.text || ''), DECLINE)

    const optional = doc.createElement('select')
    optional.id = 'native-optional-gender'
    for (const label of ['Select...', 'Male', 'I don’t wish to answer']) {
      const option = doc.createElement('option')
      option.value = label
      option.text = label
      optional.append(option)
    }
    doc.body.append(optional)
    assert.equal(await gender!.handle(optional, 'gender', blank, ''), 'skip')
    assert.equal(optional.value, 'Select...')
  },
)

test('turned-off EEO answers leave required dropdowns on Select...', async () => {
  mount()
  const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
  const rule = greenhouseConfig()
  const off = { ...saved, eeoAnswersEnabled: false } as never
  for (const [id, text] of filled) {
    const input = document.getElementById(id) as HTMLInputElement
    assert.equal(await rule.apply(input, text, off), 'skip', id)
    assert.equal(selectedLabel(input), '', id)
  }
})
})
