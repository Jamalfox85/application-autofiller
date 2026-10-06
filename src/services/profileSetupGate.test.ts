import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import type { StorageAreaLike } from '../lib/sync/activeProfile.ts'
import { ACTIVE_PROFILE_KEY, PERSONAL_INFO_KEY } from '../lib/sync/activeProfile.ts'
import {
  accountSetupEstablished,
  gateCanFinish,
  healProfileSetupCompletion,
  matchScoreSetupReady,
  resolvePopupView,
  signedInPopupScreen,
} from './profileSetupGate.ts'
import { getProfileSetupCompletedAt, skipProfileSetup, startProfileSetupSession } from './profileSetupSession.ts'

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial }
  const storage: StorageAreaLike = {
    async get(keys) {
      if (keys == null) return { ...data }
      const list = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]]))
    },
    async set(items) {
      Object.assign(data, items)
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]
    },
  }
  return { storage, data }
}

test('Skip for now sets profileSetupCompletedAt even when no setup session was started', async () => {
  const { storage, data } = memoryStorage()
  assert.equal(await getProfileSetupCompletedAt(storage), null)

  await skipProfileSetup(storage)

  const completedAt = await getProfileSetupCompletedAt(storage)
  assert.equal(typeof completedAt, 'number')
  assert.ok(completedAt && completedAt > 0)
  assert.equal('profileSetupSession' in data, false)

  await skipProfileSetup(storage)
  assert.equal(await getProfileSetupCompletedAt(storage), completedAt)
})

test('Skip for now clears an in-progress session and still records completion', async () => {
  const { storage, data } = memoryStorage()
  await startProfileSetupSession(storage)
  assert.ok(data.profileSetupSession)

  await skipProfileSetup(storage)

  assert.equal('profileSetupSession' in data, false)
  assert.equal(typeof data.profileSetupCompletedAt, 'number')
})

test('loadAppState goes to main when profiles exist even if active personalInfo names are empty', () => {
  const personalInfo = cloneDefaultPersonalInfo()
  assert.equal(personalInfo.firstName, '')
  assert.equal(personalInfo.lastName, '')
  // Primary, Contract roles, Primary copy — the active copy can have no local names.
  assert.equal(
    resolvePopupView({ personalInfo, profileCount: 3, setupCompletedAt: null }),
    'main',
  )
  assert.equal(accountSetupEstablished({ personalInfo, profileCount: 3 }), true)
})

test('first-run Welcome stays when there is no saved profile data', () => {
  const personalInfo = { ...cloneDefaultPersonalInfo(), email: 'new@example.com' }
  assert.equal(
    resolvePopupView({ personalInfo, profileCount: 0, setupCompletedAt: null }),
    'welcome',
  )
  // The signup row is one profile seeded with the auth email. That is still first-run.
  assert.equal(
    resolvePopupView({ personalInfo, profileCount: 1, setupCompletedAt: null }),
    'welcome',
  )
  assert.equal(
    resolvePopupView({
      personalInfo: cloneDefaultPersonalInfo(),
      profileCount: 1,
      setupCompletedAt: null,
    }),
    'welcome',
  )
})

test('saved names, a resume, or an explicit finish open main', () => {
  const named = { ...cloneDefaultPersonalInfo(), firstName: 'Ada', lastName: 'Lovelace' }
  assert.equal(resolvePopupView({ personalInfo: named, profileCount: 1, setupCompletedAt: null }), 'main')
  assert.equal(
    resolvePopupView({
      personalInfo: cloneDefaultPersonalInfo(),
      profileCount: 1,
      rosterHasSavedWork: true,
      setupCompletedAt: null,
    }),
    'main',
  )
  assert.equal(
    resolvePopupView({
      personalInfo: { ...cloneDefaultPersonalInfo(), email: 'new@example.com' },
      profileCount: 1,
      setupCompletedAt: 1_700_000_000_000,
    }),
    'main',
  )
})

test('healing writes profileSetupCompletedAt for an established account and leaves first-run alone', async () => {
  const established = memoryStorage()
  const personalInfo = cloneDefaultPersonalInfo()
  await healProfileSetupCompletion(established.storage, { personalInfo, profileCount: 3 })
  const healed = await getProfileSetupCompletedAt(established.storage)
  assert.equal(typeof healed, 'number')
  await healProfileSetupCompletion(established.storage, { personalInfo, profileCount: 3 })
  assert.equal(await getProfileSetupCompletedAt(established.storage), healed)

  const firstRun = memoryStorage()
  await healProfileSetupCompletion(firstRun.storage, {
    personalInfo: { ...cloneDefaultPersonalInfo(), email: 'new@example.com' },
    profileCount: 1,
  })
  assert.equal(await getProfileSetupCompletedAt(firstRun.storage), null)
})

test('Match Score setup gate opens for a finished setup or an existing roster, and stays shut on first-run', async () => {
  const finished = memoryStorage({ profileSetupCompletedAt: 1_700_000_000_000 })
  assert.equal(await matchScoreSetupReady(finished.storage), true)

  const roster = memoryStorage({
    [ACTIVE_PROFILE_KEY]: { id: 'copy', name: 'Primary copy', profileCount: 3 },
    [PERSONAL_INFO_KEY]: { ...cloneDefaultPersonalInfo(), email: 'ada@example.com' },
    profileSetupSession: { id: 'leftover', startedAt: 1 },
  })
  assert.equal(await matchScoreSetupReady(roster.storage), true)

  const firstRun = memoryStorage({
    [ACTIVE_PROFILE_KEY]: { id: 'primary', name: 'Primary', profileCount: 1 },
    [PERSONAL_INFO_KEY]: { ...cloneDefaultPersonalInfo(), email: 'new@example.com' },
    profileSetupSession: { id: 'onboarding', startedAt: 1 },
  })
  assert.equal(await matchScoreSetupReady(firstRun.storage), false)
})

test('signed-in established account does not render Welcome before the gate resolves', () => {
  const empty = cloneDefaultPersonalInfo()
  // activeView defaults to welcome. Until the gate runs, that must be the spinner.
  assert.equal(signedInPopupScreen({ gateResolved: false, activeView: 'welcome' }), 'loading')

  // Live reopen: profileSetupCompletedAt and activeProfile.profileCount are already in
  // chrome.storage.local while get_profile is still pending.
  const early = gateCanFinish({
    personalInfo: empty,
    profileCount: 3,
    setupCompletedAt: 1_700_000_000_000,
    personalInfoLoaded: false,
  })
  assert.equal(early.view, 'main')
  assert.equal(early.resolved, true)
  assert.equal(
    signedInPopupScreen({ gateResolved: early.resolved, activeView: early.view }),
    'main',
  )

  // The same roster without a timestamp is still past first-run.
  const rosterOnly = gateCanFinish({
    personalInfo: empty,
    profileCount: 3,
    setupCompletedAt: null,
    personalInfoLoaded: false,
  })
  assert.equal(rosterOnly.view, 'main')
  assert.equal(rosterOnly.resolved, true)
})

test('first-run Welcome stays, but only after personal info has loaded', () => {
  const personalInfo = { ...cloneDefaultPersonalInfo(), email: 'new@example.com' }
  const pending = gateCanFinish({
    personalInfo,
    profileCount: 1,
    setupCompletedAt: null,
    personalInfoLoaded: false,
  })
  assert.equal(pending.resolved, false)
  assert.equal(
    signedInPopupScreen({ gateResolved: pending.resolved, activeView: 'welcome' }),
    'loading',
  )

  const decided = gateCanFinish({
    personalInfo,
    profileCount: 1,
    setupCompletedAt: null,
    personalInfoLoaded: true,
  })
  assert.equal(decided.view, 'welcome')
  assert.equal(decided.resolved, true)
  assert.equal(
    signedInPopupScreen({ gateResolved: decided.resolved, activeView: decided.view }),
    'welcome',
  )
})

test('Welcome Skip and loadAppState both go through the setup-completion gate', () => {
  const welcome = readFileSync(new URL('../components/Welcome.vue', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  const matchScore = readFileSync(new URL('../content/matchScore.ts', import.meta.url), 'utf8')

  assert.match(welcome, /@skip="handleSkip"/)
  assert.match(welcome, /skipProfileSetup\(/)
  assert.doesNotMatch(welcome, /@skip="\$emit\('finish'\)"/)
  assert.match(welcome, /await markSetupComplete\(\)/)
  assert.match(welcome, /trackEvent\('profile_completed'/)

  assert.match(app, /gateCanFinish\(/)
  assert.match(app, /healProfileSetupCompletion\(/)
  assert.match(app, /signedInScreen === 'loading'/)
  assert.match(app, /signedInScreen === 'welcome'/)
  assert.doesNotMatch(app, /v-else-if="activeView === 'welcome'"/)
  assert.match(app, /completeProfileSetupSession\(/)
  assert.doesNotMatch(app, /personalInfo\.value\.firstName && personalInfo\.value\.lastName/)

  assert.match(matchScore, /matchScoreSetupReady\(/)
  assert.doesNotMatch(matchScore, /if \(!completedAt\) return/)
})
