import assert from 'node:assert/strict'
import test from 'node:test'
import { matchFieldToData } from './fieldMatch.ts'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import type { PersonalInfo } from '../types/index.ts'

function profile(overrides: Partial<PersonalInfo> = {}): PersonalInfo {
  return { ...cloneDefaultPersonalInfo(), ...overrides }
}

test('a missing profile does not map name, email, or phone to the string undefined', () => {
  const info = {} as PersonalInfo
  assert.equal(matchFieldToData('firstname', info, []), null)
  assert.equal(matchFieldToData('lastname', info, []), null)
  assert.equal(matchFieldToData('email', info, []), null)
  assert.equal(matchFieldToData('phone', info, []), null)
})

test('stored undefined and null strings are skipped, real email still maps', () => {
  const info = profile({
    firstName: 'undefined',
    lastName: 'null',
    email: 'ada@example.com',
    phone: '',
  })
  assert.equal(matchFieldToData('firstname', info, []), null)
  assert.equal(matchFieldToData('lastname', info, []), null)
  assert.equal(matchFieldToData('phone', info, []), null)
  assert.equal(matchFieldToData('emailaddress', info, [])?.matchedValue, 'ada@example.com')
})

test('a plain name field still maps to the applicant full name', () => {
  const info = profile({ firstName: 'Alex', lastName: 'Rivera' })
  assert.equal(matchFieldToData('name', info, [])?.matchedValue, 'Alex Rivera')
  assert.equal(matchFieldToData('fullname', info, [])?.matchedValue, 'Alex Rivera')
})

test('BambooHR college/university stays blank when the profile has no education', () => {
  const info = profile({
    firstName: 'Alex',
    lastName: 'Rivera',
    education: [],
  })
  // name=educationInstitutionName, label=College/University, after space stripping.
  const college = 'educationinstitutionnameeducationinstitutionnamecollege/universitytext'
  assert.equal(matchFieldToData(college, info, []), null)
  const degree = 'educationlevelideducationlevelidhighesteducationobtainedselectone'
  assert.equal(matchFieldToData(degree, info, []), null)
})

test('a school field uses the school name and never the applicant name', () => {
  const info = profile({
    firstName: 'Alex',
    lastName: 'Rivera',
    education: [
      {
        id: 1,
        schoolName: 'Stanford University',
        degreeType: 'Bachelor of Science',
        major: 'Mechanical Engineering',
        startYear: '',
        graduationYear: '',
      },
    ],
  })
  const college = 'educationinstitutionnameeducationinstitutionnamecollege/universitytext'
  assert.equal(matchFieldToData(college, info, [])?.matchedValue, 'Stanford University')
})

test('a province text field still maps to the profile state', () => {
  const info = profile({
    firstName: 'Alex',
    lastName: 'Rivera',
    state: 'California',
    country: 'united_states',
  })
  assert.equal(matchFieldToData('state.valueprovincetext', info, [])?.matchedValue, 'California')
})

test('greenhouse-style name and email labels map a real profile', () => {
  const info = profile({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '5551234567',
  })
  assert.equal(matchFieldToData('firstname', info, [])?.matchedValue, 'Ada')
  assert.equal(matchFieldToData('lastname', info, [])?.matchedValue, 'Lovelace')
  assert.equal(matchFieldToData('email', info, [])?.matchedValue, 'ada@example.com')
  assert.equal(matchFieldToData('phonenumber', info, [])?.matchedValue, '5551234567')
})
