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
