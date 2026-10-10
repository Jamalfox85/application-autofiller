import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import { fillEmptyFromParsedResume } from './resumeParsing.ts'

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

test('existing skills and entries are not replaced or duplicated', () => {
  const existing = { ...cloneDefaultPersonalInfo(), skills: ['Rust'], education: [edu({ schoolName: 'MIT' })] }
  const parsed = { skills: ['Go'], education: [edu({ schoolName: 'Temple', degreeType: 'masters' }), edu({ schoolName: 'MIT', degreeType: 'bachelors' })] }
  const out = fillEmptyFromParsedResume(existing, parsed as never)
  assert.deepEqual(out.skills, ['Rust'])
  assert.equal(out.education.length, 1)
  assert.equal(out.education[0].degreeType, 'bachelors')
})
