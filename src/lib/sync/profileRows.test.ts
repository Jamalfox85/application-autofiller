import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../personalInfoDefaults.ts'
import { normalizeParsedResume } from '../parsedResume.ts'
import { mergeParsedResumeIntoProfile } from '../../utils/resumeParsing.ts'
import {
  currentExperience,
  customResponsesToDbRows,
  dbRowsToCustomResponses,
  dbRowsToProfile,
  experienceForFill,
  preserveServerWhenResumeParseOmits,
  profileToDbRows,
} from './profileRows.ts'
import type { PersonalInfo } from '../../types/index.ts'

const PROFILE = '7b0c1f4e-2d3a-4c5b-9e8f-0a1b2c3d4e5f'

function filled(): PersonalInfo {
  return {
    ...cloneDefaultPersonalInfo(),
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    experience: [
      { id: 1, companyName: 'Analytical', jobTitle: 'Engineer', startDate: '2020-03', endDate: '', present: true, description: 'Notes' },
    ],
    education: [
      { id: 2, schoolName: 'Cambridge', degreeType: 'BS', major: 'Math', startYear: '2014', graduationYear: '2018', gpa: '3.9' },
    ],
    skills: [' TypeScript ', '', 'Go'],
    otherLinks: [{ id: 3, label: 'Blog', url: 'https://ada.dev' }],
    applicationAccounts: [{ id: 4, portal: 'Workday', email: 'a@x.com', password: 'pw', requireConfirmation: true }],
  } as PersonalInfo
}

test('profileToDbRows stamps profile_id on every child row and never writes plan or account keys', () => {
  const rows = profileToDbRows(filled(), PROFILE)

  for (const key of ['plan', 'id', 'user_id', 'name', 'synced_from_extension', 'updated_at', 'resume_parsed_at']) {
    assert.equal(key in rows.profile, false, `profile row must not carry ${key}`)
  }
  assert.equal(rows.profile.first_name, 'Ada')
  assert.equal(rows.profile.phone_country_code, '+1')

  const children = Object.entries(rows.children)
  assert.deepEqual(
    children.map(([key]) => key).sort(),
    ['application_accounts', 'education', 'other_links', 'skills', 'work_experience'],
  )
  for (const [key, list] of children) {
    assert.ok(list.length > 0, `${key} has rows`)
    for (const row of list) {
      assert.equal(row.profile_id, PROFILE, `${key} row has profile_id`)
      assert.equal('user_id' in row, false, `${key} row has no user_id`)
    }
  }
  assert.deepEqual(
    rows.children.skills.map((s) => s.name),
    ['TypeScript', 'Go'],
  )
  assert.equal(rows.children.work_experience[0].start_date, '2020-03-01')
  assert.equal(rows.children.work_experience[0].end_date, null)
  assert.equal(rows.children.education[0].gpa, 3.9)
})

test('an empty resume is omitted so a save cannot clear a stored file', () => {
  const rows = profileToDbRows(cloneDefaultPersonalInfo(), PROFILE)
  assert.equal('resume_file_name' in rows.profile, false)
  assert.equal('resume_file_path' in rows.profile, false)

  const withResume = profileToDbRows(
    { ...cloneDefaultPersonalInfo(), resumeFileName: 'ada.pdf', resumeFilePath: `u/${PROFILE}/resume.pdf` },
    PROFILE,
  )
  assert.equal(withResume.profile.resume_file_path, `u/${PROFILE}/resume.pdf`)
})

test('get_profile rows map back to PersonalInfo and custom responses', () => {
  const rows = profileToDbRows(filled(), PROFILE)
  const info = dbRowsToProfile({
    profile: { ...rows.profile, id: PROFILE, name: 'Primary', resume_file_path: `u/${PROFILE}/resume.pdf` },
    ...rows.children,
  })
  assert.equal(info.firstName, 'Ada')
  assert.equal(info.experience[0].startDate, '2020-03')
  assert.equal(info.experience[0].present, true)
  assert.equal(info.education[0].gpa, '3.9')
  assert.deepEqual(info.skills, ['TypeScript', 'Go'])
  assert.equal(info.applicationAccounts?.[0].requireConfirmation, true)
  assert.equal(info.resumeFilePath, `u/${PROFILE}/resume.pdf`)

  const responses = [{ id: 1, title: 'Why us?', text: 'Because.', tags: ['why'] }]
  const dbRows = customResponsesToDbRows(responses, PROFILE)
  assert.deepEqual(dbRows, [{ profile_id: PROFILE, title: 'Why us?', body: 'Because.', tags: ['why'] }])
  const back = dbRowsToCustomResponses(dbRows)
  assert.equal(back[0].title, 'Why us?')
  assert.equal(back[0].text, 'Because.')
  assert.deepEqual(back[0].tags, ['why'])
})

test('a resume parse that lacks phone, street, and ZIP does not null them in save_profile', () => {
  const existing = {
    ...cloneDefaultPersonalInfo(),
    firstName: 'Ada',
    phone: '(215) 555-0100',
    address: '1 Analytical Engine',
    zip: '19104',
    skills: ['Go'],
  }
  const parsed = normalizeParsedResume({
    name: 'Ada Lovelace',
    contact: { email: 'ada@example.com', city: 'Austin', state: 'TX' },
    skills: ['Rust'],
    work_history: [],
    education: [],
  })
  assert.equal(parsed.phone, undefined)
  assert.equal(parsed.address, undefined)
  assert.equal(parsed.zip, undefined)

  const merged = mergeParsedResumeIntoProfile(existing, parsed, 'ada.pdf')
  assert.equal(merged.phone, '(215) 555-0100')
  assert.equal(merged.address, '1 Analytical Engine')
  assert.equal(merged.zip, '19104')
  assert.deepEqual(merged.skills, ['Go', 'Rust'])

  const rows = preserveServerWhenResumeParseOmits(profileToDbRows(merged, PROFILE))
  assert.equal(rows.profile.phone, '(215) 555-0100')
  assert.equal(rows.profile.address, '1 Analytical Engine')
  assert.equal(rows.profile.zip, '19104')
  assert.deepEqual(
    rows.children.skills.map((row) => row.name),
    ['Go', 'Rust'],
  )

  const blank = preserveServerWhenResumeParseOmits(profileToDbRows(cloneDefaultPersonalInfo(), PROFILE))
  assert.equal('phone' in blank.profile, false)
  assert.equal('address' in blank.profile, false)
  assert.equal('zip' in blank.profile, false)
  assert.equal('skills' in blank.children, false)
})

test('current company is the present role, otherwise the latest end or start date', () => {
  const older = {
    companyName: 'American Reading Company',
    jobTitle: 'Full Stack Developer',
    startDate: '2016-01',
    endDate: '2019-06',
    present: false,
  }
  const mid = {
    companyName: 'Northwind Labs',
    jobTitle: 'Developer',
    startDate: '2019-07',
    endDate: '2023-03',
    present: false,
  }
  const current = {
    companyName: 'Acme Software',
    jobTitle: 'Product Engineer',
    startDate: '2023-04',
    endDate: '',
    present: true,
  }
  assert.equal(currentExperience([older, mid, current])?.companyName, 'Acme Software')
  assert.equal(currentExperience([older, mid])?.companyName, 'Northwind Labs')
  assert.equal(
    currentExperience([
      { companyName: 'Early', startDate: '2018-01', endDate: '', present: false },
      { companyName: 'Later', startDate: '2021-05', endDate: '', present: false },
    ])?.companyName,
    'Later',
  )
  // A later start with no end date is more recent than an earlier end date.
  assert.equal(
    currentExperience([
      { companyName: 'Ended', startDate: '2016-01', endDate: '2019-06', present: false },
      { companyName: 'Open', startDate: '2024-01', endDate: '', present: false },
    ])?.companyName,
    'Open',
  )
  // The present flag wins even when another role has a later end date.
  assert.equal(
    currentExperience([
      { companyName: 'Ended Later', startDate: '2024-01', endDate: '2025-01', present: false },
      { companyName: 'Still Here', startDate: '2020-01', endDate: '', present: true },
    ])?.companyName,
    'Still Here',
  )
  assert.equal(
    currentExperience([
      { companyName: 'First', present: true, startDate: '2020-01' },
      { companyName: 'Second', present: true, startDate: '2020-01' },
    ])?.companyName,
    'First',
  )
  assert.equal(currentExperience([]), undefined)
  assert.equal(currentExperience(undefined), undefined)

  const saved = [older, current]
  const ordered = experienceForFill(saved)
  assert.equal(ordered[0]?.companyName, 'Acme Software')
  assert.equal(ordered[1]?.companyName, 'American Reading Company')
  assert.equal(saved[0]?.companyName, 'American Reading Company')
  assert.equal(experienceForFill(undefined).length, 0)
})

test('a GPA the numeric(3,2) column cannot hold is dropped instead of failing the save', async () => {
  const { profileToDbRows } = await import('./profileRows.ts')
  const { cloneDefaultPersonalInfo } = await import('../personalInfoDefaults.ts')
  const gpaOf = (gpa: string) => {
    const info = { ...cloneDefaultPersonalInfo(), education: [{ id: 1, schoolName: 'X', degreeType: '', major: '', gpa, startYear: '', graduationYear: '', current: false, locationCity: '', locationState: '' }] }
    return profileToDbRows(info as never, 'p').children.education[0].gpa
  }
  assert.equal(gpaOf('3.85'), 3.85)
  assert.equal(gpaOf('4.0'), 4)
  assert.equal(gpaOf('95'), null)
  assert.equal(gpaOf('10'), null)
  assert.equal(gpaOf('3.8/4.0'), null)
  assert.equal(gpaOf('9.994'), 9.99)
  assert.equal(gpaOf('9.999'), null)
})
