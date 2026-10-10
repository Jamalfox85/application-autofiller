import assert from 'node:assert/strict'
import test from 'node:test'
import { profileHasUserData } from './resumeParsing.ts'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'

test('the seeded account email alone is not profile data', () => {
  const p = { ...cloneDefaultPersonalInfo(), email: 'admin@foxbytedev.com' }
  assert.equal(profileHasUserData(p), false)
  assert.equal(profileHasUserData({ ...p, firstName: 'Ada' }), true)
  assert.equal(profileHasUserData(null), false)
})
