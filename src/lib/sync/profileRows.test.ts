import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../personalInfoDefaults.ts'
import {
  customResponsesToDbRows,
  dbRowsToCustomResponses,
  dbRowsToProfile,
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
