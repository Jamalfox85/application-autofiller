import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import { getSiteLabel } from '../jobSitePatterns.ts'
import {
  classifyWorkableQuestion,
  compareWorkableFill,
  workableAddressValue,
  workableMaySubmit,
  workableMonthYear,
  workablePhase,
  workablePlan,
  workableQuestionLabel,
  workableWorkAuthAnswer,
  type WorkableField,
  type WorkableProfile,
} from './workableFields.ts'
import workableConfig, {
  describeWorkableField,
  isWorkableApplyPage,
  resetWorkableFormWatch,
} from './workable.ts'

const profile: WorkableProfile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '5551234567',
  address: '1 Analytical Engine',
  city: 'San Francisco',
  state: 'CA',
  zip: '94107',
  country: 'united_states',
  resumeFileName: 'ada.pdf',
  workAuthorization: 'us_citizen',
  sponsorshipRequired: 'No',
  gender: 'female',
  raceEthnicity: 'asian',
  veteranStatus: 'not_a_veteran',
  disabilityStatus: 'no',
  eeoAnswersEnabled: true,
  experience: [
    {
      companyName: 'Analytical Engines',
      jobTitle: 'Engineer',
      startDate: '2018-03',
      present: true,
      description: 'Built difference engines',
    },
    {
      companyName: 'Babbage Lab',
      jobTitle: 'Mathematician',
      startDate: '2014-01-15',
      endDate: '2018-02',
      description: 'Notes',
    },
  ],
  education: [
    {
      schoolName: 'University of London',
      degreeType: 'Bachelor of Science',
      major: 'Mathematics',
      startYear: '2010',
      graduationYear: '2014-06',
    },
  ],
}

function field(partial: WorkableField): WorkableField {
  return partial
}

const AUTH =
  'Are you authorized to work in the United States without requiring visa sponsorship (including H-1B transfer or new sponsorship) now or in the future?'

test('contact fields map from the profile and hidden location inputs are skipped', () => {
  assert.deepEqual(workablePlan(field({ dataUi: 'firstname', name: 'firstname' }), profile), {
    action: 'text',
    value: 'Ada',
  })
  assert.deepEqual(workablePlan(field({ dataUi: 'lastname', name: 'lastname' }), profile), {
    action: 'text',
    value: 'Lovelace',
  })
  assert.deepEqual(workablePlan(field({ dataUi: 'email', name: 'email', type: 'email' }), profile), {
    action: 'text',
    value: 'ada@example.com',
  })
  assert.deepEqual(workablePlan(field({ dataUi: 'phone', name: 'phone', id: 'input_phone', type: 'tel' }), profile), {
    action: 'text',
    value: '5551234567',
  })
  assert.equal(workableAddressValue(profile), '1 Analytical Engine, San Francisco, CA, 94107, United States')
  assert.deepEqual(workablePlan(field({ dataUi: 'address', name: 'address' }), profile), {
    action: 'text',
    value: '1 Analytical Engine, San Francisco, CA, 94107, United States',
  })
  assert.deepEqual(
    workablePlan(field({ id: 'city', name: 'city', hidden: true }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(field({ id: 'postcode', name: 'postcode', hidden: true }), profile),
    { action: 'skip' },
  )
})

test('resume is recognized and not written from the filename', () => {
  assert.equal(workablePhase(field({ dataUi: 'resume', type: 'file' })), 'resume')
  assert.deepEqual(
    workablePlan(field({ dataUi: 'resume', type: 'file' }), profile),
    { action: 'skip' },
  )
})

test('experience and education rows map dates as MM/YYYY and do not copy into an extra row', () => {
  assert.equal(workableMonthYear('2018-03'), '03/2018')
  assert.equal(workableMonthYear('2010'), '01/2010')
  assert.equal(workableMonthYear('2014-06'), '06/2014')

  const experience = { group: 'experience' as const }
  assert.deepEqual(workablePlan(field({ ...experience, name: 'title' }), profile, 0), {
    action: 'text',
    value: 'Engineer',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'company' }), profile, 0), {
    action: 'text',
    value: 'Analytical Engines',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'summary', type: 'textarea' }), profile, 0), {
    action: 'text',
    value: 'Built difference engines',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'start_date' }), profile, 0), {
    action: 'text',
    value: '03/2018',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'end_date' }), profile, 0), { action: 'skip' })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'current', type: 'checkbox' }), profile, 0), {
    action: 'click',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'industry' }), profile, 0), { action: 'skip' })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'title' }), profile, 1), {
    action: 'text',
    value: 'Mathematician',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'end_date' }), profile, 1), {
    action: 'text',
    value: '02/2018',
  })
  assert.deepEqual(workablePlan(field({ ...experience, name: 'company' }), profile, 2), { action: 'skip' })

  const education = { group: 'education' as const }
  assert.deepEqual(workablePlan(field({ ...education, name: 'school' }), profile, 0), {
    action: 'text',
    value: 'University of London',
  })
  assert.deepEqual(workablePlan(field({ ...education, name: 'field_of_study' }), profile, 0), {
    action: 'text',
    value: 'Mathematics',
  })
  assert.deepEqual(workablePlan(field({ ...education, name: 'degree' }), profile, 0), {
    action: 'text',
    value: 'Bachelor of Science',
  })
  assert.deepEqual(workablePlan(field({ ...education, name: 'start_date' }), profile, 0), {
    action: 'text',
    value: '01/2010',
  })
  assert.deepEqual(workablePlan(field({ ...education, name: 'end_date' }), profile, 0), {
    action: 'text',
    value: '06/2014',
  })
  assert.deepEqual(workablePlan(field({ ...education, name: 'school' }), profile, 1), { action: 'skip' })
})

test('work authorization follows the profile and other questions stay blank', () => {
  assert.equal(classifyWorkableQuestion(AUTH), 'authorized-without-sponsorship')
  assert.equal(workableWorkAuthAnswer('authorized-without-sponsorship', profile), 'yes')
  assert.equal(
    workableWorkAuthAnswer('authorized-without-sponsorship', {
      workAuthorization: 'work_visa',
    }),
    'no',
  )
  assert.equal(
    workableWorkAuthAnswer('authorized-without-sponsorship', {
      workAuthorization: 'work_visa',
      sponsorshipRequired: 'No',
    }),
    'yes',
  )
  assert.equal(
    workableWorkAuthAnswer('authorized-without-sponsorship', {
      ...profile,
      workAuthorization: 'need_sponsorship',
    }),
    'no',
  )
  assert.equal(
    workableWorkAuthAnswer('authorized', { workAuthorization: 'us_citizen' }),
    'yes',
  )
  assert.equal(workableWorkAuthAnswer('sponsorship', { sponsorshipRequired: 'Yes' }), 'yes')
  assert.equal(workableWorkAuthAnswer('authorized-without-sponsorship', {}), null)

  const yes = field({
    name: 'QA_12390944',
    type: 'radio',
    optionValue: 'true',
    optionLabel: 'YES',
    label: AUTH,
  })
  const no = field({ ...yes, optionValue: 'false', optionLabel: 'NO' })
  assert.equal(workablePhase(yes), 'work-authorization')
  assert.deepEqual(workablePlan(yes, profile), { action: 'click' })
  assert.deepEqual(workablePlan(no, profile), { action: 'skip' })
  assert.deepEqual(
    workablePlan(yes, { ...profile, workAuthorization: 'work_visa', sponsorshipRequired: 'Yes' }),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(
      field({ ...no, optionValue: 'false' }),
      { ...profile, workAuthorization: 'work_visa', sponsorshipRequired: 'Yes' },
    ),
    { action: 'click' },
  )

  const knockout = field({
    name: 'QA_12390945',
    type: 'radio',
    optionValue: 'true',
    optionLabel: 'YES',
    label: 'Do you have a minimum of 3-5 years work experience in a professional software development role?',
  })
  assert.equal(classifyWorkableQuestion(knockout.label), null)
  assert.equal(workablePhase(knockout), 'custom')
  assert.deepEqual(workablePlan(knockout, profile), { action: 'skip' })
  assert.deepEqual(
    workablePlan(
      field({
        name: 'QA_phone',
        type: 'text',
        label: 'What is your phone extension for the on-call rotation?',
      }),
      profile,
    ),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(field({ dataUi: 'summary', name: 'summary', type: 'textarea' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(field({ dataUi: 'cover_letter', name: 'cover_letter', type: 'textarea' }), profile),
    { action: 'skip' },
  )
})

test('EEO radios map when answers are enabled and stay blank when they are not', () => {
  const female = field({ group: 'eeo', name: 'gender', type: 'radio', optionValue: 'female' })
  const male = field({ group: 'eeo', name: 'gender', type: 'radio', optionValue: 'male' })
  assert.deepEqual(workablePlan(female, profile), { action: 'click' })
  assert.deepEqual(workablePlan(male, profile), { action: 'skip' })
  assert.deepEqual(
    workablePlan(field({ group: 'eeo', name: 'race', type: 'radio', optionValue: 'asian' }), profile),
    { action: 'click' },
  )
  assert.deepEqual(
    workablePlan(
      field({ group: 'eeo', name: 'race', type: 'radio', optionValue: 'hispanic_or_latino' }),
      { ...profile, raceEthnicity: 'hispanic_or_latino' },
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    workablePlan(
      field({ group: 'eeo', name: 'race', type: 'radio', optionValue: 'multiracial' }),
      { ...profile, raceEthnicity: 'two_or_more_races' },
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    workablePlan(field({ group: 'eeo', name: 'veteran', type: 'radio', optionValue: 'not_veteran' }), profile),
    { action: 'click' },
  )
  assert.deepEqual(
    workablePlan(
      field({ group: 'eeo', name: 'disability', type: 'radio', optionValue: 'disabled' }),
      { ...profile, disabilityStatus: 'previously' },
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    workablePlan(field({ group: 'eeo', name: 'gender', type: 'radio', optionValue: 'undisclosed' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(workablePlan(female, { ...profile, eeoAnswersEnabled: false }), { action: 'skip' })
  assert.deepEqual(
    workablePlan(female, { ...profile, gender: 'non_binary' }),
    { action: 'skip' },
  )
})

test('fill order is contact, resume, experience, education, work authorization, then EEO', () => {
  const items = [
    { id: 'school', field: field({ group: 'education', name: 'school' }), row: 0, order: 0 },
    { id: 'title', field: field({ group: 'experience', name: 'title' }), row: 0, order: 1 },
    { id: 'resume', field: field({ dataUi: 'resume', type: 'file' }), row: 0, order: 2 },
    { id: 'auth', field: field({ name: 'QA_1', type: 'radio', label: AUTH, optionValue: 'true' }), row: 0, order: 3 },
    { id: 'knockout', field: field({ name: 'QA_2', type: 'radio', label: 'Do you know React?' }), row: 0, order: 4 },
    { id: 'gender', field: field({ group: 'eeo', name: 'gender', type: 'radio', optionValue: 'female' }), row: 0, order: 5 },
    { id: 'firstname', field: field({ dataUi: 'firstname', name: 'firstname' }), row: 0, order: 6 },
    { id: 'company', field: field({ group: 'experience', name: 'company' }), row: 0, order: 7 },
  ]
  const ordered = [...items].sort(compareWorkableFill).map((item) => item.id)
  assert.deepEqual(ordered, ['firstname', 'resume', 'title', 'company', 'school', 'auth', 'gender', 'knockout'])
  assert.deepEqual(
    ordered.map((id) => workablePhase(items.find((item) => item.id === id)!.field)),
    ['contact', 'resume', 'experience', 'experience', 'education', 'work-authorization', 'eeo', 'custom'],
  )
})

test('nothing in the Workable path is allowed to submit', () => {
  assert.equal(workableMaySubmit(), false)
  assert.deepEqual(
    workablePlan(field({ dataUi: 'apply-button', type: 'submit' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(field({ dataUi: 'submit-eeoc', type: 'submit' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(
    workablePlan(field({ dataUi: 'skip-eeoc', type: 'button' }), profile),
    { action: 'skip' },
  )
})

test('question text is the nearest real question, not YES/NO and not a later section', () => {
  assert.equal(workableQuestionLabel(['YES NO', AUTH, `${AUTH} Do you know React?`]), AUTH)
  assert.equal(workableQuestionLabel(['YES', 'NO']), '')
})

const APPLY_HTML = `<!doctype html><body>
  <form data-ui="application-form">
    <div data-ui="education">
      <button type="button" data-ui="add-section" id="add-education">+ Add</button>
      <div data-ui="editor">
        <input name="school" id="school" />
        <input name="field_of_study" id="field_of_study" />
        <input name="degree" id="degree" />
        <input name="start_date" id="edu_start" placeholder="MM/YYYY" />
        <input name="end_date" id="edu_end" placeholder="MM/YYYY" />
      </div>
      <div data-ui="editor">
        <input name="school" id="school-extra" />
      </div>
    </div>
    <div data-ui="experience">
      <button type="button" data-ui="add-section" id="add-experience">+ Add</button>
      <div data-ui="editor">
        <input name="title" id="title" />
        <input name="company" id="company" />
        <input name="industry" id="industry" />
        <textarea name="summary" id="exp_summary"></textarea>
        <input name="start_date" id="exp_start" placeholder="MM/YYYY" />
        <input name="end_date" id="exp_end" placeholder="MM/YYYY" />
        <input name="current" id="current" type="checkbox" />
      </div>
    </div>
    <input data-ui="firstname" name="firstname" id="firstname" />
    <input data-ui="lastname" name="lastname" id="lastname" />
    <input data-ui="email" name="email" id="email" type="email" />
    <input data-ui="phone" name="phone" id="input_phone" type="tel" />
    <input id="city" name="city" aria-hidden="true" tabindex="-1" />
    <input data-ui="address" name="address" id="address" />
    <textarea data-ui="summary" name="summary" id="profile_summary"></textarea>
    <input data-ui="resume" id="resume" type="file" />
    <textarea data-ui="cover_letter" name="cover_letter" id="cover_letter"></textarea>
    <div id="auth-q">
      <p>${AUTH}</p>
      <fieldset data-ui="QA_12390944">
        <label>YES <input type="radio" name="QA_12390944" value="true" id="auth-yes" /></label>
        <label>NO <input type="radio" name="QA_12390944" value="false" id="auth-no" /></label>
      </fieldset>
    </div>
    <div id="knockout-q">
      <p>Do you have a minimum of 3-5 years work experience in a professional software development role?</p>
      <fieldset data-ui="QA_12390945">
        <label>YES <input type="radio" name="QA_12390945" value="true" id="knock-yes" /></label>
        <label>NO <input type="radio" name="QA_12390945" value="false" id="knock-no" /></label>
      </fieldset>
    </div>
    <button type="button" data-ui="autofill-button" id="autofill-button">Autofill</button>
    <button type="submit" data-ui="apply-button" id="apply-button">Submit application</button>
  </form>
  <form data-ui="eeoc-form">
    <input type="radio" name="gender" value="male" id="g-m" />
    <input type="radio" name="gender" value="female" id="g-f" />
    <input type="radio" name="gender" value="undisclosed" id="g-u" />
    <input type="radio" name="race" value="asian" id="r-a" />
    <input type="radio" name="veteran" value="not_veteran" id="v-n" />
    <input type="radio" name="disability" value="not_disabled" id="d-n" />
    <button type="submit" data-ui="submit-eeoc" id="submit-eeoc">Submit</button>
    <button type="button" data-ui="skip-eeoc" id="skip-eeoc">Skip</button>
  </form>
  <form id="alerts">
    <input id="job-alert" type="email" />
  </form>
</body>`

test('the site rule fills in priority order and does not submit or answer custom questions', async () => {
  resetWorkableFormWatch()
  const dom = new JSDOM(APPLY_HTML)
  const doc = dom.window.document
  const rule = workableConfig()
  const info = profile as PersonalInfo
  const writes: string[] = []
  const clicks: string[] = []

  for (const proto of [dom.window.HTMLInputElement.prototype, dom.window.HTMLTextAreaElement.prototype]) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (!desc?.set || !desc.get) continue
    Object.defineProperty(proto, 'value', {
      configurable: true,
      get() {
        return desc.get!.call(this)
      },
      set(value: string) {
        writes.push((this as HTMLElement).id || (this as HTMLInputElement).name)
        desc.set!.call(this, value)
      },
    })
  }

  const listen = (id: string) => {
    doc.getElementById(id)?.addEventListener('click', () => clicks.push(id))
  }
  for (const id of [
    'add-education',
    'add-experience',
    'current',
    'auth-yes',
    'auth-no',
    'knock-yes',
    'knock-no',
    'g-f',
    'g-m',
    'g-u',
    'r-a',
    'v-n',
    'd-n',
    'apply-button',
    'submit-eeoc',
    'skip-eeoc',
    'autofill-button',
  ]) {
    listen(id)
  }

  const read = (id: string) => doc.getElementById(id) as HTMLInputElement
  assert.equal(await rule.apply(read('school'), '', info), true)
  assert.deepEqual(writes, [
    'firstname',
    'lastname',
    'email',
    'input_phone',
    'address',
    'title',
    'company',
    'exp_summary',
    'exp_start',
    'school',
    'field_of_study',
    'degree',
    'edu_start',
    'edu_end',
  ])
  assert.equal(read('firstname').value, 'Ada')
  assert.equal(read('address').value, '1 Analytical Engine, San Francisco, CA, 94107, United States')
  assert.equal(read('city').value, '')
  assert.equal(read('title').value, 'Engineer')
  assert.equal(read('exp_summary').value, 'Built difference engines')
  assert.equal(read('exp_start').value, '03/2018')
  assert.equal(read('exp_end').value, '')
  assert.equal(read('current').checked, true)
  assert.equal(read('industry').value, '')
  assert.equal(read('school').value, 'University of London')
  assert.equal(read('edu_start').value, '01/2010')
  assert.equal(read('edu_end').value, '06/2014')
  assert.equal(read('school-extra').value, '')
  assert.equal(read('resume').value, '')
  assert.equal(read('profile_summary').value, '')
  assert.equal(read('cover_letter').value, '')
  assert.equal(read('auth-yes').checked, true)
  assert.equal(read('auth-no').checked, false)
  assert.equal(read('knock-yes').checked, false)
  assert.equal(read('knock-no').checked, false)
  assert.equal(read('g-f').checked, true)
  assert.equal(read('g-m').checked, false)
  assert.equal(read('r-a').checked, true)
  assert.equal(read('v-n').checked, true)
  assert.equal(read('d-n').checked, true)

  assert.equal(await rule.apply(read('school-extra'), '', info), 'skip')
  assert.equal(await rule.apply(read('knock-yes'), '', info), 'skip')
  assert.equal(await rule.apply(read('resume'), '', info), 'skip')
  assert.equal(await rule.apply(read('cover_letter'), '', info), 'skip')
  assert.equal(await rule.apply(read('job-alert'), 'email', info), false)
  assert.equal(read('job-alert').value, '')

  assert.ok(clicks.includes('add-experience'))
  assert.equal(clicks.filter((id) => id === 'add-experience').length, 1)
  assert.equal(clicks.includes('add-education'), false)
  assert.ok(writes.indexOf('school') > writes.indexOf('firstname'))
  assert.ok(clicks.indexOf('add-experience') < clicks.indexOf('auth-yes'))
  for (const id of ['apply-button', 'submit-eeoc', 'skip-eeoc', 'autofill-button', 'knock-yes', 'knock-no', 'auth-no']) {
    assert.equal(clicks.includes(id), false, id)
  }
  assert.match(describeWorkableField(read('auth-yes')).label || '', /authorized to work/i)
  assert.doesNotMatch(describeWorkableField(read('knock-yes')).label || '', /authorized to work/i)
})

test('hosted and embedded Workable pages match and other ATS hosts do not', () => {
  assert.equal(
    isWorkableApplyPage({
      hostname: 'apply.workable.com',
      href: 'https://apply.workable.com/acely/j/876996D5A3/apply/',
    }),
    true,
  )
  assert.equal(
    isWorkableApplyPage({
      hostname: 'www.workable.com',
      href: 'https://www.workable.com/',
    }),
    false,
  )
  assert.equal(
    isWorkableApplyPage({
      hostname: 'jobs.lever.co',
      href: 'https://jobs.lever.co/acme/role/apply',
    }),
    false,
  )
  const meta = { getAttribute: (name: string) => (name === 'content' ? 'workable.com' : null) }
  assert.equal(
    isWorkableApplyPage({
      hostname: 'careers.acme.com',
      href: 'https://careers.acme.com/apply',
      document: {
        getElementById: () => null,
        querySelector: (selector: string) => {
          if (selector === 'meta[name="domain"]') return meta as Element
          if (selector === '[data-ui="application-form"]') return {} as Element
          return null
        },
      },
    }),
    true,
  )
  assert.equal(
    isWorkableApplyPage({
      hostname: 'www.acme.com',
      href: 'https://www.acme.com/careers',
      document: {
        getElementById: () => null,
        querySelector: (selector: string) =>
          selector === 'iframe[src*="apply.workable.com"]' ? ({} as Element) : null,
      },
    }),
    false,
  )
  assert.equal(getSiteLabel('apply.workable.com'), 'Workable')
  assert.equal(getSiteLabel('www.workable.com'), 'www.workable.com')
  assert.equal(getSiteLabel('jobs.jobvite.com'), 'Jobvite')
})

test('formChanged refills only when the Workable form gains controls', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <form data-ui="application-form">
      <input id="a" />
      <input id="b" />
    </form>
  </body>`)
  const previous = globalThis.document
  Object.assign(globalThis, { document: dom.window.document })
  resetWorkableFormWatch()
  try {
    const rule = workableConfig()
    assert.equal(rule.formChanged?.([]), false)
    assert.equal(rule.formChanged?.([]), false)
    dom.window.document
      .querySelector('[data-ui="application-form"]')
      ?.insertAdjacentHTML('beforeend', '<div data-ui="editor"><input id="c" /></div>')
    assert.equal(rule.formChanged?.([]), true)
    assert.equal(rule.formChanged?.([]), false)
  } finally {
    resetWorkableFormWatch()
    Object.assign(globalThis, { document: previous })
  }
})
