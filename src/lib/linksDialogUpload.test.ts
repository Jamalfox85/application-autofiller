import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from './personalInfoDefaults.ts'
import { linksDialogUploadBase } from './linksDialogUpload.ts'
import { mergeParsedResumeIntoProfile } from '../utils/resumeParsing.ts'
import type { PersonalInfo } from '../types/index.ts'

function profile(overrides: Partial<PersonalInfo>): PersonalInfo {
  return { ...cloneDefaultPersonalInfo(), ...overrides } as PersonalInfo
}

test('a resume upload keeps link edits the Links dialog has not saved yet', () => {
  const saved = profile({
    firstName: 'Jordan',
    linkedin: 'https://www.linkedin.com/in/old-handle',
    website: 'https://old.example.com',
    github: 'https://github.com/old-handle',
    otherLinks: [],
  })
  // Edited in the dialog, not saved yet.
  const edited = profile({
    ...saved,
    linkedin: 'https://www.linkedin.com/in/jordan-reyes-demo',
    website: 'https://jordanreyes.example.com',
    github: 'https://github.com/jordanreyes-demo',
    otherLinks: [{ id: 1, label: 'X', url: 'https://x.com/jordan' }],
  })
  const base = linksDialogUploadBase(saved, edited)
  assert.equal(base.linkedin, 'https://www.linkedin.com/in/jordan-reyes-demo')
  assert.equal(base.website, 'https://jordanreyes.example.com')
  assert.equal(base.github, 'https://github.com/jordanreyes-demo')
  assert.deepEqual(base.otherLinks, [{ id: 1, label: 'X', url: 'https://x.com/jordan' }])
  // The parse fills blanks; it does not put the saved links back.
  const merged = mergeParsedResumeIntoProfile(
    base,
    { contact: { linkedin: 'https://www.linkedin.com/in/from-resume' } } as never,
    'resume.pdf',
  )
  assert.equal(merged.linkedin, 'https://www.linkedin.com/in/jordan-reyes-demo')
})

test('the rest of the profile comes from the latest saved copy, not the dialog snapshot', () => {
  const saved = profile({ firstName: 'Jordan', city: 'Austin' })
  // The dialog opened before a sync changed the city.
  const edited = profile({ firstName: 'Jordan', city: 'Dallas', linkedin: 'https://www.linkedin.com/in/x' })
  const base = linksDialogUploadBase(saved, edited)
  assert.equal(base.city, 'Austin')
  assert.equal(base.linkedin, 'https://www.linkedin.com/in/x')
})
