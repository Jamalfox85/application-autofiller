import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import { buildMatchProfile, profileHash } from './profile.ts'

const SECRETS = [
  'person@example.com',
  '555-0100',
  '123 Secret Ave',
  'Apt 9',
  '999000',
  'portal@example.com',
  'portal-secret',
  'acct@example.com',
  'acct-secret',
  'eeo-gender',
  'eeo-race',
  'eeo-disability',
  'eeo-veteran',
  'eeo-age',
]

function fullProfile() {
  return {
    ...cloneDefaultPersonalInfo(),
    email: 'person@example.com',
    phone: '555-0100',
    address: '123 Secret Ave',
    addressLine2: 'Apt 9',
    desiredSalary: '999000',
    accountEmail: 'portal@example.com',
    accountPassword: 'portal-secret',
    applicationAccounts: [
      {
        id: 1,
        portal: 'Workday',
        email: 'acct@example.com',
        password: 'acct-secret',
        requireConfirmation: true,
      },
    ],
    gender: 'eeo-gender',
    raceEthnicity: 'eeo-race',
    disabilityStatus: 'eeo-disability',
    veteranStatus: 'eeo-veteran',
    age18OrOlder: 'eeo-age',
    eeoAnswersEnabled: false,
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    zip: '78701',
    skills: ['TypeScript'],
    workAuthorization: 'Authorized',
    sponsorshipRequired: 'No',
    experience: [
      {
        id: 1,
        companyName: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2020-01',
        endDate: '',
        present: true,
        description: 'Built things',
        locationCity: 'Austin',
        locationState: 'TX',
      },
    ],
    education: [
      {
        id: 1,
        schoolName: 'State',
        degreeType: 'BS',
        major: 'CS',
        startYear: '2016',
        graduationYear: '2020',
        gpa: '3.9',
      },
    ],
  }
}

test('buildMatchProfile returns only the Match Score allowlist', () => {
  const profile = buildMatchProfile(fullProfile())
  assert.deepEqual(Object.keys(profile).sort(), [
    'education',
    'experience',
    'location',
    'skills',
    'sponsorship_required',
    'work_authorization',
  ])
  assert.deepEqual(Object.keys(profile.experience[0]).sort(), [
    'company_name',
    'description',
    'end_date',
    'job_title',
    'present',
    'start_date',
  ])
  assert.deepEqual(Object.keys(profile.education[0]).sort(), ['degree_type', 'graduation_year', 'major'])
  assert.deepEqual(Object.keys(profile.location).sort(), ['city', 'country', 'state'])
  assert.deepEqual(profile, {
    skills: ['TypeScript'],
    experience: [
      {
        job_title: 'Engineer',
        company_name: 'Acme',
        start_date: '2020-01',
        end_date: '',
        present: true,
        description: 'Built things',
      },
    ],
    education: [{ degree_type: 'BS', major: 'CS', graduation_year: '2020' }],
    location: { city: 'Austin', state: 'TX', country: 'USA' },
    work_authorization: 'Authorized',
    sponsorship_required: 'No',
  })
  const encoded = JSON.stringify(profile)
  for (const secret of SECRETS) {
    assert.equal(encoded.includes(secret), false, secret)
  }
  assert.equal(encoded.includes('eeoAnswersEnabled'), false)
  assert.equal(encoded.includes('applicationAccounts'), false)
  assert.equal(encoded.includes('desiredSalary'), false)
  assert.equal(encoded.includes('accountEmail'), false)
  assert.equal(encoded.includes('accountPassword'), false)
})

test('profileHash tracks the allowlisted payload, not contact info', async () => {
  const left = buildMatchProfile(fullProfile())
  const right = buildMatchProfile({ ...fullProfile(), email: 'other@example.com', phone: '555-0199' })
  const changed = buildMatchProfile({ ...fullProfile(), skills: ['TypeScript', 'Go'] })
  assert.equal(await profileHash(left), await profileHash(right))
  assert.notEqual(await profileHash(left), await profileHash(changed))
})
