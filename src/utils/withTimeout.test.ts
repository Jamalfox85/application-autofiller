import assert from 'node:assert/strict'
import test from 'node:test'
import { withTimeout } from './withTimeout.ts'

test('withTimeout returns the fallback for slow work and the value for fast work', async () => {
  const slow = new Promise<string>((r) => setTimeout(() => r('late'), 80))
  assert.equal(await withTimeout(slow, 10, 'fallback'), 'fallback')
  assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'fallback'), 'ok')
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 50, 'fallback'), 'fallback')
})
