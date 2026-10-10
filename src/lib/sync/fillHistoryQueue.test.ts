import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dedupeFillHistory, fillHistoryEntryKey } from './fillHistoryKey.ts'

const src = readFileSync(new URL('./fillHistory.ts', import.meta.url), 'utf8')
const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../../../supabase/migrations/20261010150000_fill_history_unique_dedupe.sql', import.meta.url),
  'utf8',
)

test('reconcile runs serialized, inside the shared lock, and tolerates duplicate-key rows', () => {
  assert.match(src, /reconcileQueue/)
  assert.match(src, /reconcileQueue\.then\(/)
  assert.match(src, /23505/)
  assert.match(src, /gofillr-fill-history-reconcile/)
  assert.match(src, /withFillHistoryLock/)
  assert.match(src, /readMirror/)
  assert.match(src, /writeMirror/)
  assert.match(background, /locks\.request\('gofillr-fill-history-reconcile'/)
  assert.match(migration, /nulls not distinct/)
  assert.doesNotMatch(migration, /a\.role is not distinct from b\.role/)
})

test('duplicate fills collapse on timestamp and site, including a missing site', () => {
  const first = { timestamp: 10, site: 'Greenhouse · boards.greenhouse.io', role: 'A' }
  const second = { timestamp: 10, site: 'Greenhouse · boards.greenhouse.io', role: 'B' }
  assert.equal(fillHistoryEntryKey(first), fillHistoryEntryKey({ timestamp: 10, site: first.site }))
  assert.equal(fillHistoryEntryKey({ timestamp: 10, site: '' }), fillHistoryEntryKey({ timestamp: 10, site: null }))
  const kept = dedupeFillHistory([first, second, { timestamp: 11, site: 'Lever · jobs.lever.co' }])
  assert.deepEqual(kept, [first, { timestamp: 11, site: 'Lever · jobs.lever.co' }])
})
