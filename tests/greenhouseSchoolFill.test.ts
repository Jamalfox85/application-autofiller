import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { degreeSearchValues, pickDegreeOption, pickSchoolOption, schoolSearchValues } from '../src/utils/siteRules/greenhouseValues.ts'

const RAW_SCHOOL = 'The University of Texas at Austin'
const CATALOG_SCHOOL = 'University of Texas - Austin'

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
  assign('Event', win.Event)
  assign('InputEvent', win.InputEvent)
  assign('MouseEvent', win.MouseEvent)
  assign('KeyboardEvent', win.KeyboardEvent)
  assign('getComputedStyle', win.getComputedStyle.bind(win))
}

function shownValue(input: HTMLInputElement): string {
  const single = input.closest('.select')?.querySelector('.select__single-value')
  const label = single?.textContent?.replace(/\s+/g, ' ').trim() || ''
  if (label) return label
  return input.value.trim()
}

test(
  'Greenhouse school fill commits University of Texas - Austin, not the raw profile string',
  { timeout: 20_000 },
  async () => {
    const html = readFileSync(new URL('../fixtures/gh-edu-school-form.html', import.meta.url), 'utf8')
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://127.0.0.1:8765/gh-edu-school-form.html',
    })
    installDom(dom)

    const { comboboxSearchIsUncommitted, fillReactSelect } = await import('../src/utils/inputHandlers.ts')
    const school = dom.window.document.getElementById('school--0') as HTMLInputElement
    const degree = dom.window.document.getElementById('degree--0') as HTMLInputElement
    assert.ok(school)
    assert.ok(degree)

    // A prior pass left the typed profile string in the combobox. That search text is
    // not a committed .select__single-value, so a later autofill must still run.
    school.value = RAW_SCHOOL
    assert.equal(comboboxSearchIsUncommitted(school), true)

    const schoolQueries = schoolSearchValues(RAW_SCHOOL)
    assert.equal(schoolQueries[0], CATALOG_SCHOOL)
    assert.ok(schoolQueries.includes(RAW_SCHOOL))

    const schoolFilled = await fillReactSelect(
      school,
      schoolQueries,
      `[id^=react-select-${school.id}-option-]`,
      (options) => pickSchoolOption(options, schoolQueries),
      'greenhouse',
    )
    assert.equal(schoolFilled, true)
    assert.equal(shownValue(school), CATALOG_SCHOOL)
    // #school--0 itself must not keep a later typed query (the raw profile string
    // or "The University of Texas - Austin"). An empty input is only ok when the
    // catalog label was committed into .select__single-value.
    const schoolTyped = school.value.trim()
    assert.ok(schoolTyped === '' || schoolTyped === CATALOG_SCHOOL)
    assert.notEqual(schoolTyped, RAW_SCHOOL)
    assert.notEqual(shownValue(school), RAW_SCHOOL)

    const degreeQueries = degreeSearchValues('Bachelor of Science')
    const degreeFilled = await fillReactSelect(
      degree,
      degreeQueries,
      `[id^=react-select-${degree.id}-option-]`,
      (options) => pickDegreeOption(options, degreeQueries),
      'greenhouse',
    )
    assert.equal(degreeFilled, true)
    assert.equal(shownValue(degree), "Bachelor's Degree")
  },
)
