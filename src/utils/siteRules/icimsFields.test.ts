import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApplicationAccount, PersonalInfo } from '../../types/index.ts'
import { icimsAccountRequiresConfirmation } from './icimsAccount.ts'
import {
  ICIMS_HCAPTCHA_STOP_MESSAGE,
  applyIcimsPlan,
  classifyIcimsControl,
  consumeIcimsHcaptchaStop,
  fillIcimsLoginGate,
  icimsEuUkResidentAnswer,
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
