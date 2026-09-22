import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dialingCodeSearchValues,
  employmentCheckboxClick,
  employmentFillPlan,
  isGreenhousePhoneDialingCodeField,
  locationSearchQueries,
  parseGreenhouseEmploymentField,
  phoneDialingCodeTarget,
  pickDialingCodeOption,
  pickLocationOption,
} from '../src/utils/siteRules/greenhouseFields.ts'

const usProfile = {
  city: 'San Francisco',
  state: 'California',
  country: 'united_states',
  phoneCountryCode: '+1',
}

describe('phone dialing-code mapping', () => {
  it('maps +1 and united_states to United States +1', () => {
    const target = phoneDialingCodeTarget(usProfile)
    assert.deepEqual(target, { label: 'United States', dialCode: '+1' })
    assert.deepEqual(dialingCodeSearchValues(target!), ['United States', 'United States +1'])
  })

  it('maps a bare +1 to United States when residence country is empty', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+1', country: '' }), {
      label: 'United States',
      dialCode: '+1',
    })
  })

  it('uses Canada when +1 belongs to a Canadian residence', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+1', country: 'canada' }), {
      label: 'Canada',
      dialCode: '+1',
    })
  })

  it('maps +44 and united_kingdom to the United Kingdom', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+44', country: 'united_states' }), {
      label: 'United Kingdom',
      dialCode: '+44',
    })
    assert.deepEqual(phoneDialingCodeTarget({ country: 'united_kingdom' }), {
      label: 'United Kingdom',
      dialCode: '+44',
    })
  })

  it('maps a residence country when no calling code is stored', () => {
    assert.deepEqual(phoneDialingCodeTarget({ country: 'united_states', phoneCountryCode: '' }), {
      label: 'United States',
      dialCode: '+1',
    })
  })

  it('does not invent a dialing code when neither phone code nor country is set', () => {
    assert.equal(phoneDialingCodeTarget({ country: '', phoneCountryCode: '' }), null)
  })

  it('picks the United States +1 option, not another +1 country', () => {
    const target = phoneDialingCodeTarget(usProfile)!
    const picked = pickDialingCodeOption(
      [
        'American Samoa +1',
        'Canada +1',
        'United States +1',
        'United States Minor Outlying Islands +1',
        'Bahamas +1242',
      ],
      target,
    )
    assert.equal(picked, 'United States +1')
  })

  it('leaves #country empty rather than selecting a near-name +1 territory', () => {
    const target = phoneDialingCodeTarget(usProfile)!
    assert.equal(
      pickDialingCodeOption(['United States Minor Outlying Islands +1', 'Canada +1'], target),
      null,
    )
  })

  it('treats only id=country as the dialing-code field', () => {
    assert.equal(isGreenhousePhoneDialingCodeField('country'), true)
    assert.equal(isGreenhousePhoneDialingCodeField('question_36622861002'), false)
    assert.equal(isGreenhousePhoneDialingCodeField('candidate-location'), false)
    assert.equal(isGreenhousePhoneDialingCodeField(null), false)
  })
})

describe('location option preference', () => {
  it('searches City, State and does not send the country slug to the geocoder', () => {
    const queries = locationSearchQueries(usProfile)
    assert.deepEqual(queries, ['San Francisco, California', 'San Francisco'])
    assert.equal(queries.some((query) => /united[_ ]states/i.test(query)), false)
  })

  it('uses the state label instead of a snake_case profile value', () => {
    assert.deepEqual(
      locationSearchQueries({ city: 'Albany', state: 'New_York', country: 'united_states' }),
      ['Albany, New York', 'Albany'],
    )
    assert.deepEqual(
      locationSearchQueries({
        city: 'Belfast',
        state: 'Northern_Ireland',
        country: 'united_kingdom',
      }),
      ['Belfast, Northern Ireland', 'Belfast'],
    )
  })

  it('prefers the US San Francisco hit over Cebu and South San Francisco', () => {
    const picked = pickLocationOption(
      [
        'San Francisco, Cebu, Philippines',
        'San Francisco, Agusan del Sur, Philippines',
        'South San Francisco, California, United States',
        'San Francisco, California, United States',
        'San Francisco, Baja California Sur, Mexico',
      ],
      usProfile,
    )
    assert.equal(picked, 'San Francisco, California, United States')
  })

  it('does not accept a wrong-country hit when that is the only option', () => {
    assert.equal(
      pickLocationOption(['San Francisco, Cebu, Philippines'], usProfile),
      null,
    )
    assert.equal(
      pickLocationOption(['San Francisco, Philippines'], usProfile),
      null,
    )
  })

  it('accepts a USA abbreviation and still rejects the Philippines result listed first', () => {
    const picked = pickLocationOption(
      ['San Francisco, Cebu, Philippines', 'San Francisco, CA, USA'],
      usProfile,
    )
    assert.equal(picked, 'San Francisco, CA, USA')
  })
})

// Mirror seed in docs/SMOKE_DUAL_CONFIRM.md. experience[0] is current; [1] is past.
const currentRole = {
  companyName: 'Northwind Labs',
  jobTitle: 'Software Engineer',
  startDate: '2022-06',
  present: true,
  description: 'Shipped internal tools used by the support team.',
  locationCity: 'Austin',
  locationState: 'TX',
}

const pastRole = {
  companyName: 'Contoso',
  jobTitle: 'Support Engineer',
  startDate: '2018-06',
  endDate: '2022-05',
  present: false,
  description: 'Handled product questions and wrote help-center articles.',
  locationCity: 'Austin',
  locationState: 'TX',
}

describe('employment field ids', () => {
  it('maps job-boards employment ids for the first and second rows', () => {
    assert.deepEqual(parseGreenhouseEmploymentField('company-name-0'), { index: 0, kind: 'company' })
    assert.deepEqual(parseGreenhouseEmploymentField('title-0'), { index: 0, kind: 'title' })
    assert.deepEqual(parseGreenhouseEmploymentField('start-date-month-0'), {
      index: 0,
      kind: 'startMonth',
    })
    assert.deepEqual(parseGreenhouseEmploymentField('start-date-year-0'), {
      index: 0,
      kind: 'startYear',
    })
    assert.deepEqual(parseGreenhouseEmploymentField('end-date-month-0'), { index: 0, kind: 'endMonth' })
    assert.deepEqual(parseGreenhouseEmploymentField('end-date-year-0'), { index: 0, kind: 'endYear' })
    assert.deepEqual(parseGreenhouseEmploymentField('current-role-0_1'), {
      index: 0,
      kind: 'currentRole',
    })

    assert.deepEqual(parseGreenhouseEmploymentField('company-name-1'), { index: 1, kind: 'company' })
    assert.deepEqual(parseGreenhouseEmploymentField('title-1'), { index: 1, kind: 'title' })
    assert.deepEqual(parseGreenhouseEmploymentField('start-date-month-1'), {
      index: 1,
      kind: 'startMonth',
    })
    assert.deepEqual(parseGreenhouseEmploymentField('start-date-year-1'), {
      index: 1,
      kind: 'startYear',
    })
    assert.deepEqual(parseGreenhouseEmploymentField('end-date-month-1'), { index: 1, kind: 'endMonth' })
    assert.deepEqual(parseGreenhouseEmploymentField('end-date-year-1'), { index: 1, kind: 'endYear' })
    assert.deepEqual(parseGreenhouseEmploymentField('current-role-1_1'), {
      index: 1,
      kind: 'currentRole',
    })
  })

  it('does not treat education ids or the current-role wrapper as employment', () => {
    for (const id of [
      'school--0',
      'degree--0',
      'discipline--0',
      'start-month--0',
      'start-year--0',
      'end-month--0',
      'end-year--0',
      'school--1',
      'start-month--1',
      'candidate-location',
      'country',
      'current-role-0',
      'company-name-0-label',
      'question_36622861002',
    ]) {
      assert.equal(parseGreenhouseEmploymentField(id), null, id)
    }
    assert.equal(parseGreenhouseEmploymentField(null), null)
    assert.equal(parseGreenhouseEmploymentField(''), null)
  })
})

describe('employment fill plan', () => {
  it('fills the current role and leaves end dates empty', () => {
    assert.deepEqual(employmentFillPlan('company', currentRole), {
      action: 'text',
      value: 'Northwind Labs',
    })
    assert.deepEqual(employmentFillPlan('title', currentRole), {
      action: 'text',
      value: 'Software Engineer',
    })
    assert.deepEqual(employmentFillPlan('startMonth', currentRole), { action: 'month', value: 'June' })
    assert.deepEqual(employmentFillPlan('startYear', currentRole), { action: 'text', value: '2022' })
    assert.deepEqual(employmentFillPlan('endMonth', currentRole), { action: 'skip' })
    assert.deepEqual(employmentFillPlan('endYear', currentRole), { action: 'skip' })
    assert.deepEqual(employmentFillPlan('currentRole', currentRole), { action: 'check' })
  })

  it('fills the past role end month and year and does not check current role', () => {
    assert.deepEqual(employmentFillPlan('company', pastRole), { action: 'text', value: 'Contoso' })
    assert.deepEqual(employmentFillPlan('title', pastRole), {
      action: 'text',
      value: 'Support Engineer',
    })
    assert.deepEqual(employmentFillPlan('startMonth', pastRole), { action: 'month', value: 'June' })
    assert.deepEqual(employmentFillPlan('startYear', pastRole), { action: 'text', value: '2018' })
    assert.deepEqual(employmentFillPlan('endMonth', pastRole), { action: 'month', value: 'May' })
    assert.deepEqual(employmentFillPlan('endYear', pastRole), { action: 'text', value: '2022' })
    assert.deepEqual(employmentFillPlan('currentRole', pastRole), { action: 'skip' })
  })

  it('skips a blank company or a year-only start month', () => {
    assert.deepEqual(employmentFillPlan('company', { companyName: '  ' }), { action: 'skip' })
    assert.deepEqual(employmentFillPlan('startMonth', { startDate: '2016', present: false }), {
      action: 'skip',
    })
    assert.deepEqual(employmentFillPlan('startYear', { startDate: '2016', present: false }), {
      action: 'text',
      value: '2016',
    })
  })

  it('reads jobTitle for the title control', () => {
    assert.deepEqual(
      employmentFillPlan('title', { jobTitle: 'Platform Engineer', companyName: 'Northwind Labs' }),
      { action: 'text', value: 'Platform Engineer' },
    )
    assert.deepEqual(employmentFillPlan('title', { companyName: 'Northwind Labs' }), {
      action: 'skip',
    })
    assert.deepEqual(employmentFillPlan('title', { jobTitle: '  ' }), { action: 'skip' })
  })

  it('writes a 4-digit year for 2020-06 and never the raw start date', () => {
    const plan = employmentFillPlan('startYear', { startDate: '2020-06', present: true })
    assert.deepEqual(plan, { action: 'text', value: '2020' })
    if (plan.action === 'text') assert.equal(plan.value.includes('-'), false)
    assert.deepEqual(
      employmentFillPlan('endYear', {
        startDate: '2020-06',
        endDate: '2020-06',
        present: false,
      }),
      { action: 'text', value: '2020' },
    )
  })
})

describe('current-role checkbox', () => {
  it('clicks current-role-{n}_1 only when that row is current and unchecked', () => {
    assert.equal(
      employmentCheckboxClick('current-role-0_1', currentRole, {
        type: 'checkbox',
        checked: false,
      }),
      true,
    )
    assert.equal(
      employmentCheckboxClick('current-role-1_1', pastRole, { type: 'checkbox', checked: false }),
      false,
    )
    assert.equal(
      employmentCheckboxClick('current-role-0_1', currentRole, { type: 'checkbox', checked: true }),
      false,
    )
    assert.equal(
      employmentCheckboxClick('current-role-0', currentRole, { type: 'checkbox', checked: false }),
      false,
    )
    assert.equal(
      employmentCheckboxClick('current-role-0_1', currentRole, { type: 'text', checked: false }),
      false,
    )
    assert.equal(
      employmentCheckboxClick(
        'current-role-2_1',
        { companyName: 'Fabrikam', startDate: '2019-01' },
        { type: 'checkbox', checked: false },
      ),
      true,
    )
  })
})
