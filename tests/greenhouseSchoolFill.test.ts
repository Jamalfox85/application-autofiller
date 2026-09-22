import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { schoolSearchValues } from '../src/utils/siteRules/greenhouseValues.ts'

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

function visibleSchool(input: HTMLInputElement): string {
  const typed = input.value.replace(/\s+/g, ' ').trim()
  if (typed) return typed
  const single = input.closest('.select')?.querySelector('.select__single-value')
  return (single?.textContent || '').replace(/\s+/g, ' ').trim()
}

test(
  'school fill leaves the catalog label, not the raw profile string',
  { timeout: 20_000 },
  async () => {
    const html = readFileSync(new URL('../fixtures/gh-edu-school-form.html', import.meta.url), 'utf8')
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://127.0.0.1:8765/gh-edu-school-form.html',
    })
    installDom(dom)

    const { comboboxSearchIsUncommitted } = await import('../src/utils/inputHandlers.ts')
    const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
    const school = dom.window.document.getElementById('school--0') as HTMLInputElement
    const degree = dom.window.document.getElementById('degree--0') as HTMLInputElement
    const discipline = dom.window.document.getElementById('discipline--0') as HTMLInputElement
    assert.equal(school.getAttribute('role'), 'combobox')
    assert.ok(dom.window.document.getElementById('react-select-school--0-listbox'))
    assert.equal(degree.getAttribute('role'), null)
    assert.equal(discipline.getAttribute('role'), null)

    const queries = schoolSearchValues(RAW_SCHOOL)
    assert.equal(queries[0], CATALOG_SCHOOL)
    assert.ok(queries.includes(RAW_SCHOOL))
    assert.ok(queries.indexOf(CATALOG_SCHOOL) < queries.indexOf(RAW_SCHOOL))

    // Prior pass left the raw profile string. There is no .select__single-value,
    // so educationComboboxLabelSettled does not treat it as done.
    school.value = RAW_SCHOOL
    assert.equal(comboboxSearchIsUncommitted(school), true)
    assert.equal(school.closest('.select')?.querySelector('.select__single-value'), null)

    const handled = await greenhouseConfig().apply(school, 'school--0', {
      education: [
        {
          schoolName: RAW_SCHOOL,
          degreeType: 'Bachelor of Science',
          major: 'Computer Science',
        },
      ],
    })
    // The education handler resolves true after the queued fill, so the generic
    // schoolName matcher does not also write the profile string.
    assert.equal(handled, true)
    assert.equal(visibleSchool(school), CATALOG_SCHOOL)
    assert.notEqual(school.value.trim(), RAW_SCHOOL)
    assert.notEqual(visibleSchool(school), 'The University of Texas - Austin')
    assert.equal(degree.value, '')
    assert.equal(discipline.value, '')
  },
)
