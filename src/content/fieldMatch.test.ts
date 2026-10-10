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

test('screening questions never get a job title or the field id', () => {
  const info = profile({
    firstName: 'Alex',
    lastName: 'Rivera',
    experience: [
      { id: 1, companyName: 'Acme', jobTitle: 'Full Stack Developer', startDate: '2020-01', endDate: '', present: true, description: '' },
    ],
  })
  const authorized =
    'question68839955legallyauthorizedtoworkinthecountryinwhichthisroleislocated?'
  assert.equal(matchFieldToData(authorized, info, []), null)
  const hybrid = 'question123456789thispositionishybrid4daysinoffice.areyouokwiththat?'
  assert.equal(matchFieldToData(hybrid, info, []), null)
  const sponsor = 'question68839955willyounoworinthefuturerequiresponsorship?'
  assert.equal(matchFieldToData(sponsor, info, []), null)
})

test('work authorization answers come from the vault, not the field text', () => {
  const info = profile({ workAuthorization: 'citizen', sponsorshipRequired: 'no' })
  const auth = matchFieldToData('yourworkauthorizationstatus?', info, [])
  assert.equal(auth?.matchedValue, 'citizen')
  const spons = matchFieldToData('willyourequiresponsorship?', info, [])
  assert.equal(spons?.matchedValue, 'no')
})

test('a short job title field still maps to the current title', () => {
  const info = profile({
    experience: [
      { id: 1, companyName: 'Acme', jobTitle: 'Engineer', startDate: '', endDate: '', present: true, description: '' },
    ],
  })
  assert.equal(matchFieldToData('jobtitle', info, [])?.matchedValue, 'Engineer')
  assert.equal(matchFieldToData('position', info, [])?.matchedValue, 'Engineer')
  assert.equal(matchFieldToData('role', info, [])?.matchedValue, 'Engineer')
})

test('address, email, and long labels still map when the signature exceeds 70 characters', () => {
  const info = profile({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '5551234567',
    address: '1 Main St',
  })
  assert.equal(matchFieldToData('address', info, [])?.matchedValue, '1 Main St')
  const longAddress =
    'jobapplication[address]addressstreetaddress(includeapartmentsuiteunitbuildingflooretc.)streetaddress(includeapartmentsuiteunitbuildingflooretc.)addressline1text'
  assert.ok(longAddress.replace(/question_?\d{4,}/g, '').length > 70)
  assert.equal(matchFieldToData(longAddress, info, [])?.matchedValue, '1 Main St')
  assert.equal(matchFieldToData('whatisyourcurrenthomeaddress?', info, [])?.matchedValue, '1 Main St')
  const longEmail =
    'emailemailemailaddressweshouldusetocontactyouaboutthisapplicationemailemail'
  assert.ok(longEmail.length > 70)
  assert.equal(matchFieldToData(longEmail, info, [])?.matchedValue, 'ada@example.com')
  const longFirst =
    'firstnamefirstnamelegalfirstnameasitappearsonyourgovernmentissuedidentificationgivennametext'
  assert.ok(longFirst.length > 70)
  assert.equal(matchFieldToData(longFirst, info, [])?.matchedValue, 'Ada')
  assert.equal(matchFieldToData('contact', info, [])?.matchedValue, '5551234567')
})

test('a sentence that merely contains role or position does not become the job title', () => {
  const info = profile({
    experience: [
      { id: 1, companyName: 'Acme', jobTitle: 'Engineer', startDate: '', endDate: '', present: true, description: 'Built things' },
    ],
  })
  assert.equal(
    matchFieldToData('thispositionishybrid4daysinoffice.areyouokwiththat', info, []),
    null,
  )
  assert.equal(
    matchFieldToData('legallyauthorizedtoworkinthecountryinwhichthisroleislocated', info, []),
    null,
  )
  assert.equal(
    matchFieldToData('explainhowyouwouldapproachthisroleonourplatform', info, []),
    null,
  )
})
