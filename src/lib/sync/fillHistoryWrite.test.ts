import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { FillHistoryEntry } from '../../types/index.ts'
import {
  fillHistoryFromStorageChange,
  fillHistoryMirrorUnchanged,
  mergeFillHistoryForWrite,
} from './fillHistoryWrite.ts'
import { mirrorEpoch, mirrorUserId, noteMirrorUser, onMirrorReset } from './mirrorEpoch.ts'

function entry(timestamp: number, site = 'Greenhouse · boards.greenhouse.io'): FillHistoryEntry {
  return {
    id: timestamp,
    role: 'Engineer',
    site,
    timestamp,
    filledCount: 2,
    totalCount: 8,
  }
}

test('a cleared mirror is not restored from the earlier snapshot', () => {
  const stale = [entry(10)]
  const plan = mergeFillHistoryForWrite(stale, [], null, true)
  assert.equal(plan.write, false)
  assert.deepEqual(plan.entries, [])
})

test('a toast fill that lands after the first read is the row that gets written', () => {
  const landed = [entry(20)]
  const plan = mergeFillHistoryForWrite([], [], landed, true)
  assert.equal(plan.write, true)
  assert.deepEqual(plan.entries, landed)
})

test('an account change commits nothing, even when storage still holds the old list', () => {
  const plan = mergeFillHistoryForWrite([entry(10)], [entry(10)], [entry(10)], false)
  assert.equal(plan.write, false)
  assert.deepEqual(plan.entries, [])
})

test('a missing mirror on a new device publishes the server rows and does not invent an empty key', () => {
  const remote = [entry(5, 'Lever · jobs.lever.co')]
  const withRemote = mergeFillHistoryForWrite(null, remote, null, true)
  assert.equal(withRemote.write, true)
  assert.deepEqual(withRemote.entries, remote)
  const empty = mergeFillHistoryForWrite(null, [], null, true)
  assert.equal(empty.write, false)
})

test('remote rows and a newer local row merge once, newest first', () => {
  const local = entry(30)
  const remote = entry(10)
  const plan = mergeFillHistoryForWrite([remote], [remote], [local, remote], true)
  assert.equal(plan.write, true)
  assert.deepEqual(
    plan.entries.map((row) => row.timestamp),
    [30, 10],
  )
})

test('storage updates replace History and a removed key clears it', () => {
  const row = entry(1)
  assert.deepEqual(fillHistoryFromStorageChange([row]), [row])
  assert.deepEqual(fillHistoryFromStorageChange([]), [])
  assert.equal(fillHistoryFromStorageChange(undefined), 'cleared')
  assert.equal(fillHistoryFromStorageChange(null), 'cleared')
})

test('an unchanged mirror is detected so reconcile does not write it back', () => {
  const row = entry(4)
  assert.equal(fillHistoryMirrorUnchanged([row], [{ ...row, id: 999 }]), true)
  assert.equal(fillHistoryMirrorUnchanged([row], [{ ...row, filledCount: 9 }]), false)
  assert.equal(fillHistoryMirrorUnchanged(null, [row]), false)
})

test('sign-out and an account switch drop mirrors; the first sign-in does not', () => {
  const resets: number[] = []
  onMirrorReset(() => resets.push(mirrorEpoch()))
  const start = mirrorEpoch()
  noteMirrorUser(mirrorUserId())
  assert.equal(mirrorEpoch(), start)
  noteMirrorUser('history-user-a')
  assert.equal(mirrorUserId(), 'history-user-a')
  assert.equal(mirrorEpoch(), start)
  assert.equal(resets.length, 0)
  noteMirrorUser('history-user-a')
  assert.equal(resets.length, 0)
  noteMirrorUser(null)
  assert.equal(mirrorEpoch(), start + 1)
  assert.equal(resets.length, 1)
  noteMirrorUser('history-user-b')
  assert.equal(resets.length, 1)
  noteMirrorUser('history-user-c')
  assert.equal(mirrorEpoch(), start + 2)
  assert.equal(resets.length, 2)
})

test('counted fills record one history row and History follows storage', () => {
  const autofill = readFileSync(new URL('../../content/autofill.ts', import.meta.url), 'utf8')
  const notifications = readFileSync(new URL('../../content/notifications.ts', import.meta.url), 'utf8')
  const quota = readFileSync(new URL('../../services/billing/quotaStore.ts', import.meta.url), 'utf8')
  const history = readFileSync(new URL('./fillHistory.ts', import.meta.url), 'utf8')
  const composable = readFileSync(new URL('../../composables/useFillHistory.ts', import.meta.url), 'utf8')
  const auth = readFileSync(new URL('../../composables/useAuth.ts', import.meta.url), 'utf8')
  const personal = readFileSync(new URL('../../composables/usePersonalInfo.ts', import.meta.url), 'utf8')
  const custom = readFileSync(new URL('../../composables/useCustomResponses.ts', import.meta.url), 'utf8')
  const profiles = readFileSync(new URL('../../composables/useProfiles.ts', import.meta.url), 'utf8')
  const resume = readFileSync(new URL('../../composables/useResumeUpload.ts', import.meta.url), 'utf8')
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')

  assert.match(notifications, /Auto-fill Form/)
  assert.match(notifications, /await autofillPage\(\)/)
  assert.match(autofill, /if \(charged\) \{[\s\S]*await recordFillHistory\(filledCount, attemptedCount\)/)
  const writeQuota = quota.slice(quota.indexOf('export async function writeFillQuota'))
  assert.match(writeQuota, /await chrome\.storage\.local\.set/)
  assert.doesNotMatch(writeQuota, /await chrome\.storage\.sync\.set/)

  assert.match(history, /mergeFillHistoryForWrite/)
  assert.match(history, /readFillHistoryMirror/)
  assert.doesNotMatch(history, /reconcileFillHistory\(\s*userId: string,\s*local:/)
  assert.match(composable, /chrome\.storage\.onChanged/)
  assert.match(composable, /fillHistoryFromStorageChange/)
  assert.match(composable, /onMirrorReset\(dropFillHistoryMemory\)/)
  assert.match(auth, /noteMirrorUser\(null\)/)
  assert.match(personal, /onMirrorReset\(invalidatePersonalInfoMemory\)/)
  assert.match(personal, /if \(!memoryValid\) return/)
  assert.match(custom, /onMirrorReset\(invalidateCustomResponses\)/)
  assert.match(profiles, /onMirrorReset\(reset\)/)
  assert.match(resume, /onMirrorReset\(dropResumeUploadMemory\)/)
  assert.match(resume, /generation !== writeGeneration/)

  const reopen = background.slice(background.indexOf('function signInStartedFromPopupTab'))
  assert.match(reopen, /sender\.tab/)
  assert.match(reopen, /popup\.html/)
  assert.match(reopen, /!signInStartedFromPopupTab\(sender\)/)
})
