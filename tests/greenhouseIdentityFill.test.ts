import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { JSDOM } from 'jsdom'

const GENDER = 'gendergenderofftext'
const HISPANIC = 'hispanicethnicityareyouhispanic/latino?offtext'
const VETERAN = 'veteranstatusveteranstatusofftext'
const PRONUNCIATION =
  'question16218466008question16218466008(optional)personalpreferences*(optional)personalpreferencesofftext'
const WHY = 'question99question99whydoyouwanttoworkhere?offtextarea'

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
  assign('requestAnimationFrame', (cb: FrameRequestCallback) => win.setTimeout(() => cb(0), 0))
}

function mount() {
  const html = readFileSync(new URL('../fixtures/gh-voluntary-identity-form.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://job-boards.example/apply' })
  installDom(dom)
  return dom
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function selectedLabel(input: HTMLElement): string {
  const single = input.closest('.select')?.querySelector('.select__single-value')
  return (single?.textContent || '').replace(/\s+/g, ' ').trim()
}

async function rule() {
  const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
  return greenhouseConfig()
}

describe('voluntary identity fields', { concurrency: false }, () => {
  test(
    'gender, hispanic/latino, veteran, and name pronunciation read back after fill',
    { timeout: 30_000 },
    async () => {
      const dom = mount()
      const apply = await rule()
      const doc = dom.window.document
      const profile = {
        eeoAnswersEnabled: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: 'male',
        raceEthnicity: 'white',
        veteranStatus: 'not_a_veteran',
      } as never

      const gender = doc.getElementById('gender') as HTMLInputElement
      const hispanic = doc.getElementById('hispanic_ethnicity') as HTMLInputElement
      const veteran = doc.getElementById('veteran_status') as HTMLInputElement
      const pronunciation = doc.getElementById('question_16218466008') as HTMLInputElement
      const why = doc.getElementById('question_99') as HTMLTextAreaElement

      assert.equal(await apply.apply(gender, GENDER, profile), true)
      assert.equal(selectedLabel(gender), 'Male')
      assert.equal(gender.value, '')
      assert.equal(gender.closest('.select')?.getAttribute('data-commit'), 'keyboard')
      assert.notEqual(gender.closest('.select')?.getAttribute('data-clicks'), '0')
      assert.notEqual(gender.closest('.select')?.getAttribute('data-wiped'), '1')

      assert.equal(await apply.apply(hispanic, HISPANIC, profile), true)
      assert.equal(selectedLabel(hispanic), 'No')
      assert.equal(hispanic.value, '')
      assert.equal((doc.getElementById('race-stored') as HTMLInputElement).value, '')
      const race = doc.getElementById('race') as HTMLInputElement
      assert.ok(race)
      assert.equal(selectedLabel(race), 'White')
      assert.equal(race.value, '')
      assert.equal(race.closest('.select')?.getAttribute('data-commit'), 'keyboard')

      assert.equal(await apply.apply(veteran, VETERAN, profile), true)
      assert.equal(selectedLabel(veteran), 'I am not a protected veteran')
      assert.equal(veteran.value, '')
      assert.equal(veteran.closest('.select')?.getAttribute('data-commit'), 'keyboard')

      assert.equal(await apply.apply(pronunciation, PRONUNCIATION, profile), true)
      assert.equal(pronunciation.value, 'Ada Lovelace')
      assert.equal(await apply.apply(why, WHY, profile), false)
      assert.equal(why.value, '')

      await delay(300)
      assert.equal(selectedLabel(gender), 'Male')
      assert.equal(selectedLabel(hispanic), 'No')
      assert.equal(selectedLabel(race), 'White')
      assert.equal(selectedLabel(veteran), 'I am not a protected veteran')
      assert.equal(pronunciation.value, 'Ada Lovelace')

      assert.equal(await apply.apply(gender, GENDER, profile), true)
      assert.equal(await apply.apply(hispanic, HISPANIC, profile), true)
      assert.equal(await apply.apply(veteran, VETERAN, profile), true)
      assert.equal(await apply.apply(pronunciation, PRONUNCIATION, profile), true)
      assert.equal(selectedLabel(gender), 'Male')
      assert.equal(selectedLabel(hispanic), 'No')
      assert.equal(selectedLabel(race), 'White')
      assert.equal(selectedLabel(veteran), 'I am not a protected veteran')
      assert.equal(pronunciation.value, 'Ada Lovelace')
    },
  )

  test(
    'hispanic or latino selects Yes and records that choice',
    { timeout: 20_000 },
    async () => {
      const dom = mount()
      const apply = await rule()
      const doc = dom.window.document
      const profile = {
        eeoAnswersEnabled: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: 'male',
        raceEthnicity: 'hispanic_or_latino',
        veteranStatus: 'not_a_veteran',
      } as never

      const hispanic = doc.getElementById('hispanic_ethnicity') as HTMLInputElement
      assert.equal(await apply.apply(hispanic, HISPANIC, profile), true)
      assert.equal(selectedLabel(hispanic), 'Yes')
      assert.equal(hispanic.value, '')
      assert.equal((doc.getElementById('race-stored') as HTMLInputElement).value, 'Hispanic or Latino')
      assert.equal(doc.getElementById('race'), null)
      await delay(300)
      assert.equal(selectedLabel(hispanic), 'Yes')
      assert.equal(doc.getElementById('race'), null)
    },
  )

  test(
    'a required hispanic question with no saved race uses the decline option',
    { timeout: 20_000 },
    async () => {
      const dom = mount()
      const apply = await rule()
      const doc = dom.window.document
      const hispanic = doc.getElementById('hispanic_ethnicity') as HTMLInputElement
      hispanic.setAttribute('aria-required', 'true')
      const profile = {
        eeoAnswersEnabled: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: '',
        raceEthnicity: '',
        veteranStatus: '',
      } as never

      assert.equal(await apply.apply(hispanic, HISPANIC, profile), true)
      assert.equal(selectedLabel(hispanic), 'Decline To Self Identify')
      assert.equal((doc.getElementById('race-stored') as HTMLInputElement).value, 'Decline To Self Identify')
      await delay(300)
      assert.equal(selectedLabel(hispanic), 'Decline To Self Identify')
    },
  )

  test('optional hispanic and gender stay empty without a saved answer, pronunciation still fills', async () => {
    const dom = mount()
    const apply = await rule()
    const doc = dom.window.document
    const profile = {
      eeoAnswersEnabled: false,
      firstName: 'Ada',
      middleName: 'Augusta',
      lastName: 'Lovelace',
      gender: 'male',
      raceEthnicity: 'white',
      veteranStatus: 'not_a_veteran',
    } as never

    const gender = doc.getElementById('gender') as HTMLInputElement
    const hispanic = doc.getElementById('hispanic_ethnicity') as HTMLInputElement
    const pronunciation = doc.getElementById('question_16218466008') as HTMLInputElement
    assert.equal(await apply.apply(gender, GENDER, profile), 'skip')
    assert.equal(await apply.apply(hispanic, HISPANIC, profile), 'skip')
    assert.equal(selectedLabel(gender), '')
    assert.equal(selectedLabel(hispanic), '')
    assert.equal(await apply.apply(pronunciation, PRONUNCIATION, profile), true)
    assert.equal(pronunciation.value, 'Ada Augusta Lovelace')
    await delay(300)
    assert.equal(pronunciation.value, 'Ada Augusta Lovelace')
  })

  test('name pronunciation stays empty when the profile has no name', async () => {
    const dom = mount()
    const apply = await rule()
    const doc = dom.window.document
    const pronunciation = doc.getElementById('question_16218466008') as HTMLInputElement
    const profile = {
      eeoAnswersEnabled: true,
      firstName: '',
      lastName: 'undefined',
      gender: 'male',
    } as never
    assert.equal(await apply.apply(pronunciation, PRONUNCIATION, profile), 'skip')
    assert.equal(pronunciation.value, '')
  })
})
