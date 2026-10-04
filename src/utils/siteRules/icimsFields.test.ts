import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { icimsPageDropdownCommand } from './icimsPageDropdownCommand.js'
import type { ApplicationAccount, PersonalInfo } from '../../types/index.ts'
import { icimsAccountRequiresConfirmation } from './icimsAccount.ts'
import {
  ICIMS_HCAPTCHA_STOP_MESSAGE,
  applyIcimsPlan,
  classifyIcimsControl,
  consumeIcimsHcaptchaStop,
  fillIcimsLocationMenus,
  fillIcimsLoginGate,
  icimsEuUkResidentAnswer,
  icimsListedSearchText,
  icimsSelectNeedsFill,
  icimsFormSignature,
  icimsGateMayAdvance,
  icimsWritesGatePassword,
  pageHasHcaptcha,
  planIcimsFill,
  resetIcimsGateFillState,
  resolveIcimsSelect,
  type IcimsControl,
  type IcimsFillPlan,
} from './icimsFields.ts'

const account = (overrides: Partial<ApplicationAccount> = {}): ApplicationAccount => ({
  id: 1,
  portal: 'iCIMS',
  email: 'icims@example.com',
  password: 'correct horse',
  requireConfirmation: true,
  ...overrides,
})

const profile = (overrides: Partial<PersonalInfo> = {}): PersonalInfo =>
  ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    address: '1 Analytical Engine',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'united_states',
    linkedin: 'https://linkedin.com/in/ada',
    website: '',
    github: '',
    education: [
      {
        id: 1,
        schoolName: 'Stanford University',
        degreeType: 'Bachelor of Science',
        major: 'Computer Science',
        startYear: '2016',
        graduationYear: '2020',
        gpa: '3.8',
      },
    ],
    experience: [
      {
        id: 1,
        companyName: 'Analytical Engines',
        jobTitle: 'Engineer',
        startDate: '2020-06',
        present: true,
        description: 'Built engines',
        locationCity: 'London',
        locationState: 'UK',
      },
      {
        id: 2,
        companyName: 'Difference Engine Co',
        jobTitle: 'Analyst',
        startDate: '2018-01',
        endDate: '2020-05',
        present: false,
        description: 'Computed tables',
      },
    ],
    skills: [],
    applicationAccounts: [account()],
    workAuthorization: 'us_citizen',
    sponsorshipRequired: 'No',
    eeoAnswersEnabled: true,
    gender: 'female',
    raceEthnicity: 'asian',
    veteranStatus: 'not_a_veteran',
    disabilityStatus: 'no',
    ...overrides,
  }) as PersonalInfo

const control = (overrides: Partial<IcimsControl> = {}): IcimsControl => ({
  tagName: 'INPUT',
  type: 'text',
  ...overrides,
})

const login = { loginSurface: true }

function textValue(plan: IcimsFillPlan): string {
  assert.equal(plan.action, 'text')
  if (plan.action !== 'text') return ''
  return plan.value
}

test('gate password is written even when requireConfirmation is on, matching Workday', () => {
  const saved = profile()
  assert.equal(icimsAccountRequiresConfirmation(saved), true)
  assert.equal(icimsWritesGatePassword(saved), true)
  assert.equal(icimsWritesGatePassword(profile({ applicationAccounts: [account({ requireConfirmation: false })] })), true)
  assert.equal(icimsWritesGatePassword(profile({ applicationAccounts: [] })), false)
  assert.equal(icimsGateMayAdvance(), false)

  const email = planIcimsFill(
    control({ type: 'email', name: 'email', autocomplete: 'email' }),
    saved,
    login,
  )
  const password = planIcimsFill(control({ type: 'password', name: 'css_password' }), saved, login)
  const confirm = planIcimsFill(
    control({ type: 'password', autocomplete: 'new-password', name: 'css_password_confirm' }),
    saved,
    login,
  )
  assert.equal(textValue(email), 'icims@example.com')
  assert.equal(textValue(password), 'correct horse')
  assert.equal(textValue(confirm), 'correct horse')
})

test('a missing iCIMS password is claimed and not replaced with the legacy Workday password', () => {
  const info = profile({
    applicationAccounts: [],
    accountEmail: 'legacy@example.com',
    accountPassword: 'legacy-secret',
  })
  const plan = planIcimsFill(control({ type: 'password', id: 'password' }), info, login)
  assert.deepEqual(plan, { field: 'gatePassword', action: 'leave', reason: 'password-missing' })
  const input = { type: 'password', id: 'password', value: '' }
  assert.equal(applyIcimsPlan(input, plan), true)
  assert.equal(input.value, '')
})

test('contact email on the application uses the profile, and the gate uses the account', () => {
  const info = profile()
  const gate = planIcimsFill(control({ type: 'email', autocomplete: 'email', name: 'css_loginName' }), info, login)
  const contact = planIcimsFill(
    control({ id: 'PersonProfileFields.Email', type: 'email' }),
    info,
    login,
  )
  const offGate = planIcimsFill(control({ type: 'email', autocomplete: 'email' }), info, { loginSurface: false })
  assert.equal(textValue(gate), 'icims@example.com')
  assert.equal(textValue(contact), 'ada@example.com')
  assert.equal(textValue(offGate), 'ada@example.com')
})

test('EU/UK resident stays unanswered, including when the profile country is the UK', () => {
  assert.equal(icimsEuUkResidentAnswer(profile({ country: 'united_kingdom' })), null)
  assert.equal(icimsEuUkResidentAnswer(profile({ country: 'Germany' })), null)
  const plan = planIcimsFill(
    control({
      type: 'checkbox',
      name: 'euResident',
      fieldText: 'i am a resident of the european union or united kingdom',
    }),
    profile({ country: 'united_kingdom' }),
    login,
  )
  assert.deepEqual(plan, { field: 'euUkResident', action: 'leave', reason: 'eu-uk' })
  const box = { type: 'checkbox', checked: false, value: '' }
  assert.equal(applyIcimsPlan(box, plan), true)
  assert.equal(box.checked, false)
})

test('hCaptcha is detected and never written', () => {
  const doc = {
    querySelector(selector: string) {
      return selector === '.h-captcha' ? { id: 'widget' } : null
    },
  }
  assert.equal(pageHasHcaptcha(doc), true)
  assert.equal(pageHasHcaptcha({ querySelector: () => null }), false)

  const plan = planIcimsFill(
    control({ tagName: 'TEXTAREA', name: 'h-captcha-response', fieldText: 'hcaptcha' }),
    profile(),
    login,
  )
  assert.equal(plan.action, 'leave')
  if (plan.action === 'leave') assert.equal(plan.reason, 'captcha')
  const widget = { value: '' }
  assert.equal(applyIcimsPlan(widget, plan), true)
  assert.equal(widget.value, '')
})

test('fillIcimsLoginGate writes account email and password and does not advance or touch captcha', () => {
  resetIcimsGateFillState()
  const clicks: string[] = []
  const eu = {
    tagName: 'INPUT',
    type: 'checkbox',
    name: 'euResident',
    checked: false,
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return 'checkbox'
      if (name === 'name') return 'euResident'
      return null
    },
    click() {
      clicks.push('eu')
    },
  }
  const email = {
    tagName: 'INPUT',
    type: 'email',
    name: 'email',
    autocomplete: 'email',
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return 'email'
      if (name === 'name') return 'email'
      if (name === 'autocomplete') return 'email'
      return null
    },
    click() {
      clicks.push('email')
    },
  }
  const password = {
    tagName: 'INPUT',
    type: 'password',
    name: 'password',
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return 'password'
      if (name === 'name') return 'password'
      return null
    },
  }
  const captcha = {
    tagName: 'TEXTAREA',
    name: 'h-captcha-response',
    value: '',
    getAttribute(name: string) {
      return name === 'name' ? 'h-captcha-response' : null
    },
  }
  const next = {
    tagName: 'BUTTON',
    type: 'submit',
    textContent: 'Next',
    value: '',
    getAttribute(name: string) {
      return name === 'type' ? 'submit' : null
    },
    click() {
      clicks.push('next')
    },
  }
  const doc = {
    querySelector(selector: string) {
      return selector === '.h-captcha' ? { id: 'widget' } : null
    },
    querySelectorAll() {
      return [email, password, eu, captcha, next]
    },
  }
  const infos: string[] = []
  const original = console.info
  console.info = (...args: unknown[]) => {
    infos.push(args.map(String).join(' '))
  }
  try {
    const result = fillIcimsLoginGate(doc, profile(), {
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/555885/role/login',
      search: '?in_iframe=1',
    })
    assert.equal(consumeIcimsHcaptchaStop(doc), true)
    assert.equal(consumeIcimsHcaptchaStop(doc), false)
    assert.deepEqual(result.wrote, ['email', 'password'])
    assert.equal(result.hcaptcha, true)
  } finally {
    console.info = original
    resetIcimsGateFillState()
  }
  assert.equal(email.value, 'icims@example.com')
  assert.equal(password.value, 'correct horse')
  assert.equal(eu.checked, false)
  assert.equal(captcha.value, '')
  assert.deepEqual(clicks, [])
  assert.deepEqual(infos, [ICIMS_HCAPTCHA_STOP_MESSAGE])
})

test('gate fill does nothing without a complete iCIMS account', () => {
  resetIcimsGateFillState()
  const email = {
    tagName: 'INPUT',
    type: 'email',
    value: '',
    getAttribute(name: string) {
      return name === 'type' ? 'email' : name === 'autocomplete' ? 'email' : null
    },
  }
  const doc = {
    querySelector: () => null,
    querySelectorAll: () => [email],
  }
  const result = fillIcimsLoginGate(doc, profile({ applicationAccounts: [] }), {
    hostname: 'us-erac.icims.com',
    pathname: '/jobs/555885/login',
    search: '',
  })
  assert.deepEqual(result.wrote, [])
  assert.equal(email.value, '')
})

test('contact fields map name, email, phone, address, and LinkedIn, and skip street 2', () => {
  const info = profile()
  assert.equal(textValue(planIcimsFill(control({ id: 'PersonProfileFields.FirstName' }), info)), 'Ada')
  assert.equal(textValue(planIcimsFill(control({ id: 'PersonProfileFields.LastName' }), info)), 'Lovelace')
  assert.equal(textValue(planIcimsFill(control({ id: 'PersonProfileFields.PhoneNumber' }), info)), '555-0100')
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.AddressStreet1' }), info)),
    '1 Analytical Engine',
  )
  assert.equal(textValue(planIcimsFill(control({ id: 'PersonProfileFields.AddressCity' }), info)), 'San Francisco')
  assert.equal(textValue(planIcimsFill(control({ id: 'PersonProfileFields.AddressZip' }), info)), '94105')
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.SocialLinkedIn' }), info)),
    'https://linkedin.com/in/ada',
  )
  const street2 = planIcimsFill(control({ id: 'PersonProfileFields.AddressStreet2' }), info)
  assert.deepEqual(street2, { field: 'addressLine2', action: 'leave', reason: 'address-line-2' })
  const phoneType = planIcimsFill(control({ id: 'PersonProfileFields.PhoneType', tagName: 'SELECT', type: 'select' }), info)
  assert.equal(phoneType.action, 'leave')
})

test('state and country selects use the profile alias, and text country uses the display label', () => {
  const info = profile()
  const state = planIcimsFill(
    control({ tagName: 'SELECT', type: 'select', id: 'PersonProfileFields.AddressState' }),
    info,
  )
  assert.equal(state.action, 'select')
  if (state.action !== 'select') return
  assert.equal(
    resolveIcimsSelect(state, [
      { value: '', label: 'Select' },
      { value: 'California', label: 'California' },
      { value: 'New York', label: 'New York' },
    ]),
    'California',
  )
  const country = planIcimsFill(control({ id: 'PersonProfileFields.AddressCountry' }), info)
  assert.equal(textValue(country), 'United States')
})

test('experience and education use the matching row and do not invent an end date for a current role', () => {
  const info = profile()
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.Jobs0.JobTitle' }), info)),
    'Engineer',
  )
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.Jobs1.Employer' }), info)),
    'Difference Engine Co',
  )
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.Jobs0.CurrentEmployer' }), info)),
    'Analytical Engines',
  )
  const current = planIcimsFill(
    control({ type: 'checkbox', id: 'PersonProfileFields.Jobs0.ICurrentlyWorkHere' }),
    info,
  )
  assert.deepEqual(current, { field: 'experienceCurrent', action: 'check', checked: true })
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.Jobs0.StartDate' }), info)),
    '2020-06',
  )
  const currentEnd = planIcimsFill(control({ id: 'PersonProfileFields.Jobs0.EndDate' }), info)
  assert.deepEqual(currentEnd, { field: 'experienceEnd', action: 'leave', reason: 'current-role' })
  assert.equal(
    textValue(planIcimsFill(control({ id: 'PersonProfileFields.Jobs1.EndDate' }), info)),
    '2020-05',
  )
  const missing = planIcimsFill(control({ id: 'PersonProfileFields.Jobs3.JobTitle' }), info)
  assert.equal(missing.action, 'leave')
  const input = { value: 'untouched' }
  assert.equal(applyIcimsPlan(input, missing), true)
  assert.equal(input.value, 'untouched')

  assert.equal(textValue(planIcimsFill(control({ id: 'Education0.School' }), info)), 'Stanford University')
  assert.equal(textValue(planIcimsFill(control({ id: 'Education0.Major' }), info)), 'Computer Science')
  const degree = planIcimsFill(control({ tagName: 'SELECT', type: 'select', id: 'Education0.Degree' }), info)
  assert.equal(degree.action, 'select')
  if (degree.action !== 'select') return
  assert.equal(
    resolveIcimsSelect(degree, [
      { value: 'ba', label: "Bachelor's Degree" },
      { value: 'ma', label: "Master's Degree" },
    ]),
    'ba',
  )
})

test('work authorization and EEO selects follow the profile and skip when EEO is off', () => {
  const info = profile()
  const auth = planIcimsFill(
    control({ tagName: 'SELECT', type: 'select', id: 'WorkAuthorization' }),
    info,
  )
  assert.equal(auth.action, 'select')
  if (auth.action !== 'select') return
  assert.equal(
    resolveIcimsSelect(auth, [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]),
    'yes',
  )
  const sponsor = planIcimsFill(control({ tagName: 'SELECT', type: 'select', name: 'sponsorship' }), info)
  assert.equal(sponsor.action, 'select')
  if (sponsor.action !== 'select') return
  assert.equal(
    resolveIcimsSelect(sponsor, [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]),
    'no',
  )

  const gender = planIcimsFill(control({ tagName: 'SELECT', type: 'select', name: 'gender' }), info)
  assert.equal(gender.action, 'select')
  if (gender.action !== 'select') return
  assert.equal(
    resolveIcimsSelect(gender, [
      { value: 'm', label: 'Male' },
      { value: 'f', label: 'Female' },
    ]),
    'f',
  )
  assert.equal(
    resolveIcimsSelect(
      { field: 'eeoGender', action: 'select', mode: 'gender', query: 'male' },
      [
        { value: 'm', label: 'Male' },
        { value: 'f', label: 'Female' },
      ],
    ),
    'm',
  )

  const off = planIcimsFill(
    control({ tagName: 'SELECT', type: 'select', name: 'gender' }),
    profile({ eeoAnswersEnabled: false, gender: 'female' }),
  )
  assert.deepEqual(off, { field: 'eeoGender', action: 'leave', reason: 'eeo-off' })
})

test('custom rcf questions, resume files, and source stay blank', () => {
  const info = profile()
  assert.equal(classifyIcimsControl(control({ id: 'PersonProfileFields.rcf3048', fieldText: 'phone' }), false), 'custom')
  const custom = planIcimsFill(control({ id: 'rcf3048', fieldText: 'years of experience with cobol' }), info)
  assert.equal(custom.action, 'leave')
  const source = planIcimsFill(control({ id: 'PersonProfileFields.Source', fieldText: 'how did you hear about us' }), info)
  assert.equal(source.action, 'leave')
  const resume = planIcimsFill(control({ type: 'file', name: 'Resume' }), info)
  assert.deepEqual(resume, { field: 'resumeFile', action: 'leave', reason: 'resume' })
  const file = { type: 'file', value: '' }
  assert.equal(applyIcimsPlan(file, resume), true)
  assert.equal(file.value, '')
})

test('form signature changes when a control appears and ignores the value', () => {
  const email = {
    tagName: 'INPUT',
    type: 'email',
    name: 'email',
    id: 'email',
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return 'email'
      if (name === 'name') return 'email'
      if (name === 'id') return 'email'
      return null
    },
  }
  const first = { querySelectorAll: () => [email] }
  const before = icimsFormSignature(first)
  email.value = 'icims@example.com'
  assert.equal(icimsFormSignature(first), before)
  const password = {
    tagName: 'INPUT',
    type: 'password',
    name: 'password',
    id: 'password',
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return 'password'
      if (name === 'name') return 'password'
      if (name === 'id') return 'password'
      return null
    },
  }
  assert.notEqual(icimsFormSignature({ querySelectorAll: () => [email, password] }), before)
})

test('site rule apply fills the login-gate email from the iCIMS account and still skips AddressStreet2', async () => {
  const previousWindow = globalThis.window
  Object.assign(globalThis, {
    window: { location: { hostname: 'careers-jobyaviation.icims.com', pathname: '/jobs/5424/login', search: '?in_iframe=1' } },
  })
  try {
    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    const email = {
      getAttribute: (name: string) => (name === 'autocomplete' ? 'email' : name === 'type' ? 'email' : null),
      value: '',
      type: 'email',
    }
    assert.equal(
      await rule.apply(email as unknown as HTMLInputElement, 'email', profile() as never),
      true,
    )
    assert.equal(email.value, 'icims@example.com')

    const street2 = {
      getAttribute: (name: string) => (name === 'id' ? 'PersonProfileFields.AddressStreet2' : null),
      id: 'PersonProfileFields.AddressStreet2',
      value: 'leave-me',
      type: 'text',
    }
    assert.equal(await rule.apply(street2 as unknown as HTMLInputElement, 'addressstreet2', profile() as never), true)
    assert.equal(street2.value, 'leave-me')
  } finally {
    globalThis.window = previousWindow
  }
})

test('listed search text uses the full state name and the country display label', () => {
  assert.equal(icimsListedSearchText('NJ', 'state'), 'New Jersey')
  assert.equal(icimsListedSearchText('United States', 'country'), 'United States')
  assert.equal(icimsListedSearchText('united_states', 'country'), 'United States')
  assert.equal(
    icimsSelectNeedsFill({
      tagName: 'SELECT',
      value: '-999',
      selectedIndex: 0,
      options: [{ value: '-999', text: '— Make a Selection —' }],
    }),
    true,
  )
  assert.equal(
    icimsSelectNeedsFill({
      tagName: 'SELECT',
      value: 'D41001',
      selectedIndex: 0,
      options: [{ value: 'D41001', text: 'United States' }],
    }),
    false,
  )
})

test('iCIMS country dropdown selects United States before the state dropdown can load New Jersey', async () => {
  const previousIcims = (globalThis as { ICIMS?: unknown }).ICIMS
  const clicks: string[] = []
  const order: string[] = []
  const countrySpan = { textContent: '— Make a Selection —' }
  const stateSpan = { textContent: 'Please select a country' }
  const countrySelect = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressCountry',
    name: 'PersonProfileFields.AddressCountry',
    value: '',
    options: [{ value: '', text: '— Make a Selection —' }],
    getAttribute(name: string) {
      if (name === 'id') return 'PersonProfileFields.AddressCountry'
      if (name === 'name') return 'PersonProfileFields.AddressCountry'
      if (name === 'icimsdropdown-enabled') return '1'
      return null
    },
    click() {
      clicks.push('country')
    },
  }
  const stateSelect = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressState',
    name: 'PersonProfileFields.AddressState',
    value: '',
    options: [{ value: '', text: 'Please select a country' }],
    getAttribute(name: string) {
      if (name === 'id') return 'PersonProfileFields.AddressState'
      if (name === 'name') return 'PersonProfileFields.AddressState'
      if (name === 'data-ddd-parent-link') return 'PersonProfileFields.AddressCountry'
      return null
    },
    click() {
      clicks.push('state')
    },
  }
  const submit = {
    tagName: 'BUTTON',
    type: 'submit',
    value: 'Submit Profile',
    click() {
      clicks.push('submit')
    },
  }
  const doc = {
    getElementById(id: string) {
      if (id === 'PersonProfileFields.AddressCountry_fakeSelected_icimsDropdown') return countrySpan
      if (id === 'PersonProfileFields.AddressState_fakeSelected_icimsDropdown') return stateSpan
      return null
    },
    querySelectorAll(selector: string) {
      if (selector === 'select') return [stateSelect, countrySelect]
      return [submit]
    },
  }
  countrySelect.ownerDocument = doc
  stateSelect.ownerDocument = doc

  const countryWidget = {
    setInput(value: string) {
      this.query = value
    },
    query: '',
    words: [] as Array<{ value: string; text: string }>,
    resetOptions(callback?: () => void) {
      const query = this.query.toLowerCase()
      this.words = query.includes('united')
        ? [
            { value: 'D41234', text: 'United States Minor Outlying Islands' },
            { value: 'D41001', text: 'United States' },
          ]
        : []
      callback?.()
    },
    getWords() {
      return this.words
    },
    findWordFromValue(value: string) {
      return this.words.find((word) => word.value === value) ?? null
    },
    optionSelected(word: { value: string; text: string }) {
      order.push('country')
      countrySelect.value = word.value
      countrySelect.options = [{ value: word.value, text: word.text }]
      countrySpan.textContent = word.text
      throw new Error('list.onchange is not a function')
    },
  }
  const stateWidget = {
    setInput(value: string) {
      this.query = value
    },
    query: '',
    words: [] as Array<{ value: string; text: string }>,
    resetOptions(callback?: () => void) {
      order.push(`state:${countrySelect.value}`)
      this.words =
        countrySelect.value && countrySelect.value !== '-999'
          ? [
              { value: 'D41001035', text: 'New York' },
              { value: 'D41001033', text: 'New Jersey' },
              { value: 'D41001034', text: 'New Mexico' },
            ]
          : [{ value: '', text: 'Please select a country' }]
      callback?.()
    },
    getWords() {
      return this.words
    },
    findWordFromValue(value: string) {
      return this.words.find((word) => word.value === value) ?? null
    },
    optionSelected(word: { value: string; text: string }) {
      order.push(`state-set:${word.text}`)
      stateSelect.value = word.value
      stateSelect.options = [{ value: word.value, text: word.text }]
      stateSpan.textContent = word.text
    },
  }
  ;(globalThis as { ICIMS?: unknown }).ICIMS = {
    dropdowns: {
      'PersonProfileFields.AddressCountry': countryWidget,
      'PersonProfileFields.AddressState': stateWidget,
    },
  }

  try {
    await fillIcimsLocationMenus(
      doc,
      profile({ country: 'United States', state: 'NJ', city: 'Test City', zip: '07001' }),
    )
    assert.equal(countrySpan.textContent, 'United States')
    assert.equal(countrySelect.value, 'D41001')
    assert.equal(stateSpan.textContent, 'New Jersey')
    assert.equal(stateSelect.value, 'D41001033')
    assert.deepEqual(order, ['country', 'state:D41001', 'state-set:New Jersey'])
    assert.deepEqual(clicks, [])

    countrySelect.value = ''
    countrySelect.options = [{ value: '', text: '— Make a Selection —' }]
    countrySpan.textContent = '— Make a Selection —'
    stateSelect.value = ''
    stateSelect.options = [{ value: '', text: 'Please select a country' }]
    stateSpan.textContent = 'Please select a country'
    order.length = 0
    await fillIcimsLocationMenus(doc, profile({ country: 'united_states', state: 'NJ' }))
    assert.equal(countrySpan.textContent, 'United States')
    assert.equal(stateSpan.textContent, 'New Jersey')
  } finally {
    if (previousIcims === undefined) delete (globalThis as { ICIMS?: unknown }).ICIMS
    else (globalThis as { ICIMS?: unknown }).ICIMS = previousIcims
  }
})

test('native iCIMS country and state options select United States and New Jersey without a widget', async () => {
  const previousIcims = (globalThis as { ICIMS?: unknown }).ICIMS
  delete (globalThis as { ICIMS?: unknown }).ICIMS
  const country = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressCountry',
    value: '',
    options: [
      { value: '', text: '— Make a Selection —' },
      { value: 'US', text: 'United States' },
      { value: 'UM', text: 'United States Minor Outlying Islands' },
    ],
    getAttribute(name: string) {
      return name === 'id' ? 'PersonProfileFields.AddressCountry' : null
    },
  }
  const state = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressState',
    value: '',
    options: [
      { value: '', text: 'Please select a country' },
      { value: 'NJ', text: 'New Jersey' },
      { value: 'NY', text: 'New York' },
    ],
    getAttribute(name: string) {
      if (name === 'id') return 'PersonProfileFields.AddressState'
      if (name === 'data-ddd-parent-link') return 'PersonProfileFields.AddressCountry'
      return null
    },
  }
  try {
    await fillIcimsLocationMenus(
      { querySelectorAll: () => [country, state] },
      profile({ country: 'United States', state: 'NJ' }),
    )
    assert.equal(country.value, 'US')
    assert.equal(state.value, 'NJ')
  } finally {
    if (previousIcims === undefined) delete (globalThis as { ICIMS?: unknown }).ICIMS
    else (globalThis as { ICIMS?: unknown }).ICIMS = previousIcims
  }
})

test('content script fills United States then New Jersey through the page dropdown registry', async () => {
  const previousIcims = (globalThis as { ICIMS?: unknown }).ICIMS
  delete (globalThis as { ICIMS?: unknown }).ICIMS
  const clicks: string[] = []
  const order: string[] = []
  const queries: string[] = []
  const countrySpan = { textContent: '— Make a Selection —' }
  const stateSpan = { textContent: 'Please select a country' }
  const euResident = { type: 'checkbox', id: 'eu_resident', checked: false, click() { clicks.push('eu') } }
  const hcaptcha = { id: 'hcaptcha', click() { clicks.push('hcaptcha') } }
  const countrySelect = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressCountry',
    name: 'PersonProfileFields.AddressCountry',
    value: '-999',
    options: [{ value: '-999', text: '— Make a Selection —' }],
    getAttribute(name: string) {
      if (name === 'id') return 'PersonProfileFields.AddressCountry'
      if (name === 'name') return 'PersonProfileFields.AddressCountry'
      if (name === 'icimsdropdown-enabled') return '1'
      return null
    },
    click() {
      clicks.push('country')
    },
  }
  const stateSelect = {
    tagName: 'SELECT',
    id: 'PersonProfileFields.AddressState',
    name: 'PersonProfileFields.AddressState',
    value: '',
    options: [{ value: '', text: 'Please select a country' }],
    getAttribute(name: string) {
      if (name === 'id') return 'PersonProfileFields.AddressState'
      if (name === 'name') return 'PersonProfileFields.AddressState'
      if (name === 'data-ddd-parent-link') return 'PersonProfileFields.AddressCountry'
      return null
    },
    click() {
      clicks.push('state')
    },
  }
  const buttons = ['Next', 'Log In', 'Create Account', 'Submit'].map((label) => ({
    tagName: 'BUTTON',
    type: label === 'Submit' ? 'submit' : 'button',
    value: label,
    click() {
      clicks.push(label)
    },
  }))
  const doc = {
    getElementById(id: string) {
      if (id === 'PersonProfileFields.AddressCountry_fakeSelected_icimsDropdown') return countrySpan
      if (id === 'PersonProfileFields.AddressState_fakeSelected_icimsDropdown') return stateSpan
      if (id === 'eu_resident') return euResident
      return null
    },
    querySelectorAll(selector: string) {
      queries.push(selector)
      if (selector === 'select') return [stateSelect, countrySelect]
      clicks.push(selector)
      return [...buttons, hcaptcha]
    },
  }
  countrySelect.ownerDocument = doc
  stateSelect.ownerDocument = doc
  const countryWidget = {
    query: '',
    words: [] as Array<{ value: string; text: string }>,
    setInput(value: string) {
      countryWidget.query = value
    },
    resetOptions(callback?: () => void) {
      const query = countryWidget.query.toLowerCase()
      countryWidget.words = query.includes('united')
        ? [
            { value: 'D41234', text: 'United States Minor Outlying Islands' },
            { value: 'D41001', text: 'United States' },
          ]
        : []
      callback?.()
    },
    getWords() {
      return countryWidget.words
    },
    findWordFromValue(value: string) {
      return countryWidget.words.find((word) => word.value === value) ?? null
    },
    optionSelected(word: { value: string; text: string }) {
      order.push('country:' + word.text)
      countrySelect.value = word.value
      countrySelect.options = [{ value: word.value, text: word.text }]
      countrySpan.textContent = word.text
      throw new Error('list.onchange is not a function')
    },
  }
  const stateWidget = {
    query: '',
    words: [] as Array<{ value: string; text: string }>,
    setInput(value: string) {
      stateWidget.query = value
    },
    resetOptions(callback?: () => void) {
      order.push(`state-search:${countrySelect.value}:${stateWidget.query}`)
      stateWidget.words =
        countrySelect.value && countrySelect.value !== '-999'
          ? [
              { value: 'D41001035', text: 'New York' },
              { value: 'D41001033', text: 'New Jersey' },
              { value: 'D41001034', text: 'New Mexico' },
            ]
          : [{ value: '', text: 'Please select a country' }]
      callback?.()
    },
    getWords() {
      return stateWidget.words
    },
    findWordFromValue(value: string) {
      return stateWidget.words.find((word) => word.value === value) ?? null
    },
    optionSelected(word: { value: string; text: string }) {
      order.push(`state-set:${word.text}`)
      stateSelect.value = word.value
      stateSelect.options = [{ value: word.value, text: word.text }]
      stateSpan.textContent = word.text
    },
  }
  const sandbox = vm.createContext({
    setTimeout,
    clearTimeout,
    ICIMS: {
      dropdowns: {
        'PersonProfileFields.AddressCountry': countryWidget,
        'PersonProfileFields.AddressState': stateWidget,
      },
    },
    document: {
      querySelector() {
        clicks.push('page-query')
        return hcaptcha
      },
    },
  })
  const command = `(${icimsPageDropdownCommand.toString()})`
  const bridge = (request: unknown) => {
    assert.equal((globalThis as { ICIMS?: unknown }).ICIMS, undefined)
    return vm.runInContext(`${command}(${JSON.stringify(request)})`, sandbox)
  }

  try {
    await fillIcimsLocationMenus(
      doc,
      profile({ country: 'United States', state: 'NJ', city: 'Test City', zip: '07001' }),
      bridge,
    )
    assert.equal(countrySpan.textContent, 'United States')
    assert.equal(countrySelect.value, 'D41001')
    assert.equal(stateSpan.textContent, 'New Jersey')
    assert.equal(stateSelect.value, 'D41001033')
    assert.equal(countryWidget.query, 'United States')
    assert.equal(stateWidget.query, 'New Jersey')
    assert.deepEqual(order, [
      'country:United States',
      'state-search:D41001:New Jersey',
      'state-set:New Jersey',
    ])
    assert.deepEqual(clicks, [])
    assert.deepEqual(queries, ['select'])
    assert.equal(euResident.checked, false)
    assert.equal((globalThis as { ICIMS?: unknown }).ICIMS, undefined)

    countrySelect.value = '-999'
    countrySelect.options = [{ value: '-999', text: '— Make a Selection —' }]
    countrySpan.textContent = '— Make a Selection —'
    stateSelect.value = ''
    stateSelect.options = [{ value: '', text: 'Please select a country' }]
    stateSpan.textContent = 'Please select a country'
    countryWidget.words = []
    stateWidget.words = []
    order.length = 0
    await fillIcimsLocationMenus(doc, profile({ country: 'united_states', state: 'NJ' }), bridge)
    assert.equal(countrySpan.textContent, 'United States')
    assert.equal(stateSpan.textContent, 'New Jersey')
    assert.deepEqual(clicks, [])
  } finally {
    if (previousIcims === undefined) delete (globalThis as { ICIMS?: unknown }).ICIMS
    else (globalThis as { ICIMS?: unknown }).ICIMS = previousIcims
  }
})
