import assert from 'node:assert/strict'
import test from 'node:test'
import { coerceFillText, profileHasAutofillData } from './fillValue.ts'

test('missing profile values are not the words undefined or null', () => {
  assert.equal(coerceFillText(undefined), null)
  assert.equal(coerceFillText(null), null)
  assert.equal(coerceFillText('undefined'), null)
  assert.equal(coerceFillText('  NULL '), null)
  assert.equal(coerceFillText('undefined undefined'), null)
  assert.equal(coerceFillText('NaN'), null)
  assert.equal(coerceFillText(''), null)
  assert.equal(coerceFillText('   '), null)
})

test('real answers and numeric salary still fill', () => {
  assert.equal(coerceFillText('Ada'), 'Ada')
  assert.equal(coerceFillText(' ada@example.com '), 'ada@example.com')
  assert.equal(coerceFillText(120000), '120000')
  assert.equal(coerceFillText(0), '0')
})

test('an install placeholder profile has nothing to autofill', () => {
  assert.equal(profileHasAutofillData(undefined), false)
  assert.equal(profileHasAutofillData(null), false)
  assert.equal(profileHasAutofillData({}), false)
  assert.equal(
    profileHasAutofillData({
      firstName: undefined,
      lastName: undefined,
      email: '',
      phone: 'undefined',
    }),
    false,
  )
})

test('a partial profile with one real field is fillable', () => {
  assert.equal(profileHasAutofillData({ phone: '5550100' }), true)
  assert.equal(
    profileHasAutofillData({ education: [{ schoolName: 'MIT', degreeType: '' }] }),
    true,
  )
  assert.equal(profileHasAutofillData({ education: [], eeoAnswersEnabled: true }), false)
})

test('a profile holding only app defaults is empty', () => {
  assert.equal(
    profileHasAutofillData({
      firstName: '',
      phoneCountryCode: '+1',
      eeoAnswersEnabled: true,
      salaryNegotiable: false,
      education: [],
    }),
    false,
  )
  assert.equal(profileHasAutofillData({ phoneCountryCode: '+1', firstName: 'Ada' }), true)
})

test('the sign-in email and default country code alone are not a fillable profile', () => {
  assert.equal(profileHasAutofillData({ email: 'me@example.com', phoneCountryCode: '+1', country: '' }), false)
  assert.equal(profileHasAutofillData({ email: 'me@example.com', firstName: 'Ada' }), true)
})

test('skills count, and a row id or a blank list does not', () => {
  assert.equal(profileHasAutofillData({ email: 'me@example.com', skills: ['Go'] }), true)
  assert.equal(profileHasAutofillData({ email: 'me@example.com', skills: ['', '  '] }), false)
  assert.equal(
    profileHasAutofillData({ email: 'me@example.com', education: [{ id: 1, schoolName: '' }] }),
    false,
  )
  assert.equal(
    profileHasAutofillData({
      email: 'me@example.com',
      applicationAccounts: [{ id: 4, portal: '', email: 'work@example.com', password: '' }],
    }),
    true,
  )
})
