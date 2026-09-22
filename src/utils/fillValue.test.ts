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
  assert.equal(profileHasAutofillData({ email: 'ada@example.com' }), true)
  assert.equal(
    profileHasAutofillData({ education: [{ schoolName: 'MIT', degreeType: '' }] }),
    true,
  )
  assert.equal(profileHasAutofillData({ education: [], eeoAnswersEnabled: true }), false)
})
