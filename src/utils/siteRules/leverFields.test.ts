import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isHostedLeverPage } from './lever.ts'
import {
  leverEeoChoice,
  leverEeoOptionMatches,
  leverFullName,
  leverLocationQueries,
  leverPhoneValue,
  leverPlan,
  pickLeverDegreeOption,
  pickLeverLocationOption,
  summarizeLeverEeo,
  type LeverProfile,
} from './leverFields.ts'

const profile: LeverProfile = {
  firstName: 'Ada',
  middleName: 'M',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '5551234567',
  phoneCountryCode: '+1',
  city: 'San Francisco',
  state: 'California',
  zip: '94107',
  country: 'united_states',
  linkedin: 'https://linkedin.com/in/ada',
  workAuthorization: 'us_citizen',
  sponsorshipRequired: 'No',
  gender: 'male',
  raceEthnicity: 'asian',
  veteranStatus: 'not_a_veteran',
  disabilityStatus: 'no',
  eeoAnswersEnabled: true,
  education: [
    {
      schoolName: 'University of California, Berkeley',
      degreeType: 'Bachelor of Science',
      major: 'Computer Science',
      startYear: '2016-09',
      graduationYear: '2020-05',
    },
    {
      schoolName: 'Stanford University',
      degreeType: 'Master of Science',
      major: 'Mathematics',
      startYear: '2020-09',
      graduationYear: '2022-06',
    },
  ],
  experience: [
    {
      companyName: 'Analytical Engines',
      jobTitle: 'Engineer',
      startDate: '2022-01',
      endDate: '2024-03',
    },
    {
      companyName: 'Difference Engine',
      jobTitle: 'Mathematician',
      startDate: '2018-06',
      endDate: '2021-12',
    },
  ],
}

const genderOptions = ['Select ...', 'Male', 'Female', 'Decline to self-identify']
const raceOptions = [
  'Select ...',
  'Hispanic or Latino',
  'White (Not Hispanic or Latino)',
  'Black or African American (Not Hispanic or Latino)',
  'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)',
  'Asian (Not Hispanic or Latino)',
  'American Indian or Alaska Native (Not Hispanic or Latino)',
  'Two or More Races (Not Hispanic or Latino)',
  'Decline to self-identify',
]
const veteranOptions = [
  'Select ...',
  'I am a veteran',
  'I am not a veteran',
  'Decline to self-identify',
]
const disabilityOptions = [
  'Select ...',
  'Yes, I have a disability, or have had one in the past',
  'No, I do not have a disability and have not had one in the past',
  'I do not want to answer',
]
const degreeOptions = [
  'Please indicate your highest level of education attained:',
  'High School Diploma',
  "Bachelor's Degree",
  "Master's Degree",
  'PhD',
  'Other',
]

describe('Lever contact fields', () => {
  it('fills full name, email, phone, and LinkedIn from the standard inputs', () => {
    assert.equal(leverFullName(profile), 'Ada M Lovelace')
    assert.equal(leverPhoneValue(profile), '+1 5551234567')
    assert.deepEqual(leverPlan({ name: 'name', type: 'text', label: 'Full name' }, profile), {
      action: 'text',
      value: 'Ada M Lovelace',
    })
    assert.deepEqual(leverPlan({ name: 'email', type: 'email', label: 'Email' }, profile), {
      action: 'text',
      value: 'ada@example.com',
    })
    assert.deepEqual(leverPlan({ name: 'phone', type: 'text', label: 'Phone' }, profile), {
      action: 'text',
      value: '+1 5551234567',
    })
    assert.deepEqual(
      leverPlan({ name: 'urls[LinkedIn]', type: 'text', label: 'LinkedIn URL' }, profile),
      { action: 'text', value: 'https://linkedin.com/in/ada' },
    )
  })

  it('fills split first and last name when a card asks for them', () => {
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field0]', type: 'text', label: 'First name' }, profile),
      {
        action: 'text',
        value: 'Ada',
      },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field1]', type: 'text', label: 'Last name' }, profile),
      {
        action: 'text',
        value: 'Lovelace',
      },
    )
  })

  it('leaves portfolio, essays, referrals, and the resume file alone', () => {
    assert.equal(
      leverPlan({ name: 'urls[Portfolio]', type: 'text', label: 'Portfolio URL' }, profile),
      null,
    )
    assert.equal(
      leverPlan({ name: 'urls[GitHub]', type: 'text', label: 'GitHub URL' }, profile),
      null,
    )
    assert.equal(leverPlan({ name: 'resume', type: 'file', label: 'Resume/CV' }, profile), null)
    assert.equal(
      leverPlan(
        {
          name: 'cards[a][field1]',
          type: 'textarea',
          label: 'Why are you interested in Wealthfront?',
        },
        profile,
      ),
      null,
    )
    assert.equal(
      leverPlan(
        {
          name: 'cards[a][field2]',
          type: 'radio',
          label: 'How did you hear about us?',
          optionLabel: 'LinkedIn Job Postings',
        },
        profile,
      ),
      null,
    )
  })
})

describe('Lever location', () => {
  it('searches city and state, then picks the US row over other San Franciscos', () => {
    assert.deepEqual(leverLocationQueries(profile), ['San Francisco, California', 'San Francisco'])
    assert.deepEqual(
      leverPlan(
        { name: 'location', type: 'text', label: 'Current location', className: 'location-input' },
        profile,
      ),
      { action: 'location' },
    )
    assert.equal(
      pickLeverLocationOption(
        [
          'San Francisco, CA, USA',
          'San Francisco, Agusan Del Sur, Caraga, PHL',
          'San Francisco, Petén, GTM',
        ],
        profile,
      ),
      'San Francisco, CA, USA',
    )
  })

  it('prefers the state abbreviation when several US rows match the city', () => {
    assert.equal(
      pickLeverLocationOption(['New York, NY, USA', 'New York, MO, USA', 'New York, USA'], {
        ...profile,
        city: 'New York',
        state: 'New York',
      }),
      'New York, NY, USA',
    )
  })

  it('fills a separate city / state / postal row and a country select', () => {
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field1]', type: 'text', label: 'Current Address (City)' },
        profile,
      ),
      { action: 'text', value: 'San Francisco' },
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field2]', type: 'text', label: 'Current Address (State)' },
        profile,
      ),
      { action: 'text', value: 'California' },
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field4]', type: 'text', label: 'Current Address (Postal Code)' },
        profile,
      ),
      { action: 'text', value: '94107' },
    )
    assert.deepEqual(
      leverPlan(
        {
          name: 'cards[a][field0]',
          type: 'select-one',
          label: 'What is your location?',
          className: 'candidate-location',
        },
        profile,
        0,
        { optionTexts: ['Select...', 'United States', 'Canada', 'United Kingdom'] },
      ),
      { action: 'select', optionText: 'United States' },
    )
  })
})

describe('Lever experience and education', () => {
  it('fills the first two companies and titles and claims a third', () => {
    assert.deepEqual(
      leverPlan({ name: 'org', type: 'text', label: 'Current company' }, profile, 0),
      {
        action: 'text',
        value: 'Analytical Engines',
      },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field0]', type: 'text', label: 'Previous company' }, profile, 1),
      { action: 'text', value: 'Difference Engine' },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field1]', type: 'text', label: 'Job title' }, profile, 0),
      { action: 'text', value: 'Engineer' },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field2]', type: 'text', label: 'Job title' }, profile, 1),
      { action: 'text', value: 'Mathematician' },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field3]', type: 'text', label: 'Previous company' }, profile, 2),
      { action: 'claim' },
    )
  })

  it('does not copy the first job into a second row the profile does not have', () => {
    const oneJob = { ...profile, experience: [profile.experience![0]] }
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field0]', type: 'text', label: 'Previous company' }, oneJob, 1),
      { action: 'claim' },
    )
  })

  it('maps the first two schools, degrees, and majors', () => {
    assert.deepEqual(
      leverPlan(
        {
          name: 'cards[a][field8]',
          type: 'select-one',
          label: 'What university did you attend?',
          dataQa: 'university-dropdown',
        },
        profile,
        0,
        {
          optionTexts: [
            'Select a university or college',
            'Berkeley College',
            'University of California - Berkeley',
          ],
        },
      ),
      { action: 'select', optionText: 'University of California - Berkeley' },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field9]', type: 'select-one', label: 'University' }, profile, 1, {
        optionTexts: [
          'Select a university or college',
          'Stanford University',
          'University of California, Berkeley',
        ],
      }),
      { action: 'select', optionText: 'Stanford University' },
    )
    assert.equal(pickLeverDegreeOption(degreeOptions, 'Bachelor of Science'), "Bachelor's Degree")
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field5]', type: 'select-one', label: 'Highest Education Completed?' },
        profile,
        0,
        { optionTexts: degreeOptions },
      ),
      { action: 'select', optionText: "Bachelor's Degree" },
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field5]', type: 'select-one', label: 'Highest Education Completed?' },
        profile,
        1,
        { optionTexts: degreeOptions },
      ),
      { action: 'select', optionText: "Master's Degree" },
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field7]', type: 'text', label: 'What was your major field of study?' },
        profile,
        0,
      ),
      { action: 'text', value: 'Computer Science' },
    )
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field7]', type: 'text', label: 'Major' }, profile, 1),
      { action: 'text', value: 'Mathematics' },
    )
  })
})

describe('Lever work authorization', () => {
  const sponsorship =
    'Do you now, or will you in the future, require sponsorship for employment visa status?'
  const authorized = 'Are you currently authorized to work in the U.S.?'

  it('answers sponsorship from the explicit flag and work authorization otherwise', () => {
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field4]', type: 'radio', label: sponsorship, optionLabel: 'No' },
        profile,
      ),
      { action: 'click' },
    )
    assert.equal(
      leverPlan(
        { name: 'cards[a][field4]', type: 'radio', label: sponsorship, optionLabel: 'Yes' },
        profile,
      ),
      null,
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field4]', type: 'radio', label: sponsorship, optionLabel: 'Yes' },
        { ...profile, sponsorshipRequired: 'Yes' },
      ),
      { action: 'click' },
    )
    assert.deepEqual(
      leverPlan(
        { name: 'cards[a][field0]', type: 'radio', label: authorized, optionLabel: 'Yes' },
        { workAuthorization: 'us_citizen' },
      ),
      { action: 'click' },
    )
    assert.equal(
      leverPlan(
        { name: 'cards[a][field0]', type: 'radio', label: sponsorship, optionLabel: 'Yes' },
        { workAuthorization: '' },
      ),
      null,
    )
  })

  it('treats "require work authorization" as sponsorship, not "already authorized"', () => {
    const label =
      'Would you now or in the future require work authorization to accept employment in the United Kingdom?'
    assert.deepEqual(
      leverPlan({ name: 'cards[a][field0]', type: 'radio', label, optionLabel: 'No' }, profile),
      { action: 'click' },
    )
  })
})

describe('Lever EEO', () => {
  it('selects the standard hosted gender, race, veteran, and disability options', () => {
    assert.equal(leverEeoChoice('gender', genderOptions, profile), 'Male')
    assert.equal(leverEeoChoice('race', raceOptions, profile), 'Asian (Not Hispanic or Latino)')
    assert.equal(leverEeoChoice('veteran', veteranOptions, profile), 'I am not a veteran')
    assert.equal(
      leverEeoChoice('disability', disabilityOptions, profile),
      'No, I do not have a disability and have not had one in the past',
    )
    assert.equal(leverEeoOptionMatches('gender', 'Woman', profile), false)
    assert.equal(leverEeoOptionMatches('gender', 'Man', profile), true)
    assert.equal(
      leverEeoOptionMatches('race', 'White (Not Hispanic or Latino)', {
        ...profile,
        raceEthnicity: 'hispanic_or_latino',
      }),
      false,
    )
    assert.equal(
      leverEeoOptionMatches('race', 'Hispanic or Latino', {
        ...profile,
        raceEthnicity: 'hispanic_or_latino',
      }),
      true,
    )
  })

  it('picks decline when the answer is empty and skips when EEO answers are off', () => {
    assert.equal(
      leverEeoChoice('gender', genderOptions, { ...profile, gender: '' }),
      'Decline to self-identify',
    )
    assert.equal(
      leverEeoChoice('gender', genderOptions, { ...profile, eeoAnswersEnabled: false }),
      null,
    )
    assert.equal(
      leverEeoOptionMatches('gender', 'Male', { ...profile, eeoAnswersEnabled: false }),
      false,
    )
    assert.equal(
      leverPlan(
        { name: 'eeo[gender]', type: 'select-one', label: 'Gender' },
        { ...profile, eeoAnswersEnabled: false },
        0,
        { optionTexts: genderOptions },
      ),
      null,
    )
  })

  it('does not fail the plan when the option list cannot express the profile value', () => {
    assert.equal(
      leverEeoChoice('gender', genderOptions, { ...profile, gender: 'non_binary' }),
      null,
    )
    assert.equal(
      leverPlan(
        { name: 'eeo[gender]', type: 'select-one', label: 'Gender' },
        { ...profile, gender: 'non_binary' },
        0,
        { optionTexts: genderOptions },
      ),
      null,
    )
  })

  it('summarizes attempted, filled, and skipped without requiring a fill', () => {
    assert.equal(summarizeLeverEeo([]), null)
    assert.deepEqual(summarizeLeverEeo([{ enabled: true, filled: true }]), {
      attempted: true,
      filled: true,
      skipped: false,
    })
    assert.deepEqual(
      summarizeLeverEeo([
        { enabled: true, filled: true },
        { enabled: true, filled: false },
      ]),
      { attempted: true, filled: true, skipped: true },
    )
    assert.deepEqual(summarizeLeverEeo([{ enabled: false, filled: false }]), {
      attempted: false,
      filled: false,
      skipped: true,
    })
  })
})

describe('hosted Lever detection', () => {
  it('tags lever hosts and does not let a Greenhouse-shaped form id steal them', () => {
    const doc = {
      getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
      querySelector: () => null,
    }
    assert.equal(
      isHostedLeverPage({
        hostname: 'jobs.lever.co',
        href: 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5/apply',
        document: doc,
      }),
      true,
    )
    assert.equal(
      isHostedLeverPage({
        hostname: 'jobs.eu.lever.co',
        href: 'https://jobs.eu.lever.co/acme/abc/apply?gh_jid=8220620',
        document: doc,
      }),
      true,
    )
    assert.equal(
      isHostedLeverPage({
        hostname: 'www.carvana.com',
        href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
        document: doc,
      }),
      false,
    )
    assert.equal(
      isHostedLeverPage({
        hostname: 'jobs.ashbyhq.com',
        href: 'https://jobs.ashbyhq.com/ashby/example/application',
      }),
      false,
    )
  })
})
