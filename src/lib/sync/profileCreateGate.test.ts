import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ProfileError, profileErrorCode } from './profiles.ts'
import { createProfileAfterPlanRefresh, type ServerPlanSnapshot } from './profileCreateGate.ts'

const proRequired = (error: unknown) => profileErrorCode(error) === 'pro_required'

test('create refreshes a free DB plan to pro before the RPC, including a failed first refresh', async () => {
  let plan: 'free' | 'pro' = 'free'
  let creates = 0
  const id = await createProfileAfterPlanRefresh({
    refreshPlan: async () => {
      plan = 'pro'
      return { ok: true, plan: 'pro' }
    },
    createProfile: async () => {
      creates += 1
      if (plan !== 'pro') throw new ProfileError('pro_required')
      return 'new-id'
    },
    proRequired,
  })
  assert.equal(id, 'new-id')
  assert.equal(creates, 1)

  // Modal-open refresh can no-op. The retry runs only after a later refresh reports pro.
  plan = 'free'
  creates = 0
  let refreshes = 0
  const retried = await createProfileAfterPlanRefresh({
    refreshPlan: async (): Promise<ServerPlanSnapshot> => {
      refreshes += 1
      if (refreshes === 1) return { ok: false }
      plan = 'pro'
      return { ok: true, plan: 'pro' }
    },
    createProfile: async () => {
      creates += 1
      if (plan !== 'pro') throw new ProfileError('pro_required')
      return 'copy-id'
    },
    proRequired,
  })
  assert.equal(retried, 'copy-id')
  assert.equal(creates, 2)
  assert.equal(refreshes, 2)
})

test('a free plan still rejects the second profile once, without a second create', async () => {
  for (const refreshPlan of [
    async (): Promise<ServerPlanSnapshot> => ({ ok: true, plan: 'free' }),
    async (): Promise<ServerPlanSnapshot> => ({ ok: false }),
  ]) {
    let creates = 0
    await assert.rejects(
      () =>
        createProfileAfterPlanRefresh({
          refreshPlan,
          createProfile: async () => {
            creates += 1
            throw new ProfileError('pro_required')
          },
          proRequired,
        }),
      (error: unknown) => error instanceof ProfileError && error.code === 'pro_required',
    )
    assert.equal(creates, 1)
  }

  let creates = 0
  let refreshes = 0
  await assert.rejects(
    () =>
      createProfileAfterPlanRefresh({
        refreshPlan: async () => {
          refreshes += 1
          return { ok: true, plan: 'pro' as const }
        },
        createProfile: async () => {
          creates += 1
          throw new ProfileError('name_taken')
        },
        proRequired,
      }),
    (error: unknown) => error instanceof ProfileError && error.code === 'name_taken',
  )
  assert.equal(creates, 1)
  assert.equal(refreshes, 1)
})

test('create and duplicate both wait for the plan refresh, and the paywall covers a full tab', () => {
  const composable = readFileSync(new URL('./../../composables/useProfiles.ts', import.meta.url), 'utf8')
  const createFn = composable.slice(composable.indexOf('async function create'), composable.indexOf('async function rename'))
  assert.match(createFn, /createProfileAfterPlanRefresh/)
  assert.match(createFn, /syncServerPlan/)
  const refreshAt = createFn.indexOf('createProfileAfterPlanRefresh')
  const rpcAt = createFn.indexOf('createProfile(name, copyFrom)')
  assert.ok(refreshAt !== -1 && rpcAt !== -1 && refreshAt < rpcAt)

  const modal = readFileSync(new URL('./../../components/ProfilesModal.vue', import.meta.url), 'utf8')
  assert.match(modal, /const result = await store\.create\(name, profile\.id\)/)
  assert.match(modal, /await store\.create\(request\.name, request\.start === 'copy' \? request\.copyFrom : null\)/)
  assert.match(modal, /code === 'pro_required'/)
  assert.match(modal, /emit\('upgrade', 'multi_profile'\)/)
  assert.doesNotMatch(modal, /createProfile\(/)

  const paywall = readFileSync(new URL('./../../components/PaywallDialog.vue', import.meta.url), 'utf8')
  const overlay = paywall.slice(paywall.indexOf('.paywall-overlay'), paywall.indexOf('.paywall-card'))
  assert.match(overlay, /position:\s*fixed/)
  assert.doesNotMatch(overlay, /position:\s*absolute/)
})
