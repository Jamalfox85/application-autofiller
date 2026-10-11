import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import { fillEmptyFromParsedResume, mergeParsedResumeIntoProfile } from './resumeParsing.ts'

const edu = (o: object) => ({ id: 1, schoolName: '', degreeType: '', major: '', gpa: '', startYear: '', graduationYear: '', current: false, locationCity: '', locationState: '', ...o })

test('a re-parse fills blank phone, GitHub and degree and keeps user-entered values', () => {
  const existing = {
    ...cloneDefaultPersonalInfo(),
    firstName: 'Alexandra',
    city: 'Blue Bell',
    phone: '',
    github: '',
    education: [edu({ schoolName: 'Temple University', major: 'My own major' })],
  }
  const parsed = {
    firstName: 'Alex',
    city: 'Philadelphia',
    phone: '(215) 555-0100',
    phoneCountryCode: '+1',
    github: 'https://github.com/alexm',
    education: [edu({ schoolName: 'Temple University', degreeType: 'bachelors', major: 'Finance', graduationYear: '2018' })],
    skills: ['Go'],
  }
  const out = fillEmptyFromParsedResume(existing, parsed as never, 'cv.pdf')
  assert.equal(out.firstName, 'Alexandra')
  assert.equal(out.city, 'Blue Bell')
  assert.equal(out.phone, '(215) 555-0100')
  assert.equal(out.github, 'https://github.com/alexm')
  assert.equal(out.education[0].degreeType, 'bachelors')
  assert.equal(out.education[0].graduationYear, '2018')
  assert.equal(out.education[0].major, 'My own major')
  assert.deepEqual(out.skills, ['Go'])
  assert.equal(out.resumeFileName, 'cv.pdf')
})

test('existing skills are merged and de-duplicated, and entries are not replaced', () => {
  const existing = { ...cloneDefaultPersonalInfo(), skills: ['Rust', 'Go'], education: [edu({ schoolName: 'MIT' })] }
  const parsed = { skills: ['go', 'Python'], education: [edu({ schoolName: 'Temple', degreeType: 'masters' }), edu({ schoolName: 'MIT', degreeType: 'bachelors' })] }
  const out = fillEmptyFromParsedResume(existing, parsed as never)
  assert.deepEqual(out.skills, ['Rust', 'Go', 'Python'])
  assert.equal(out.education.length, 1)
  assert.equal(out.education[0].degreeType, 'bachelors')
})

test('a resume that lacks phone, street, and ZIP does not clear them', () => {
  const existing = {
    ...cloneDefaultPersonalInfo(),
    firstName: 'Ada',
    phone: '(215) 555-0100',
    address: '1 Analytical Engine',
    zip: '19104',
    skills: ['Go'],
  }
  const parsed = {
    firstName: 'Augusta',
    phone: '',
    address: '   ',
    zip: '',
    city: 'Austin',
    skills: ['Rust', 'Go'],
  }
  const out = mergeParsedResumeIntoProfile(existing, parsed, 'cv.pdf')
  assert.equal(out.firstName, 'Ada')
  assert.equal(out.phone, '(215) 555-0100')
  assert.equal(out.address, '1 Analytical Engine')
  assert.equal(out.zip, '19104')
  assert.equal(out.city, 'Austin')
  assert.deepEqual(out.skills, ['Go', 'Rust'])
  assert.equal(out.resumeFileName, 'cv.pdf')

  const confirmed = mergeParsedResumeIntoProfile(existing, parsed, 'cv.pdf', { confirmReplace: true })
  assert.equal(confirmed.phone, '(215) 555-0100')
  assert.equal(confirmed.address, '1 Analytical Engine')
  assert.equal(confirmed.zip, '19104')
  assert.deepEqual(confirmed.skills, ['Rust', 'Go'])
})
