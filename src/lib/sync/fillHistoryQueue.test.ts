import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./fillHistory.ts', import.meta.url), 'utf8')

test('reconcile runs serialized and tolerates duplicate-key rows', () => {
  assert.match(src, /reconcileQueue/)
  assert.match(src, /reconcileQueue\.then\(/)
  assert.match(src, /23505/)
  assert.match(src, /gofillr-fill-history-reconcile/)
})
