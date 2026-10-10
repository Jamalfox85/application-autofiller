import assert from 'node:assert/strict'
import test from 'node:test'
import { completePersonalInfo } from './personalInfoDefaults.ts'

test('a half-loaded profile gets empty lists so dialogs never read length of undefined', () => {
  for (const input of [{}, null, undefined, { experience: undefined, education: null as never }]) {
    const info = completePersonalInfo(input as never)
    assert.equal(info.experience.length, 0)
    assert.equal(info.education.length, 0)
    assert.equal(info.skills.length, 0)
  }
  const kept = completePersonalInfo({ firstName: 'Ada', skills: ['Go'] })
  assert.equal(kept.firstName, 'Ada')
  assert.deepEqual(kept.skills, ['Go'])
})
