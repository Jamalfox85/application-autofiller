import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROFILE_ERROR_COPY,
  ProfileError,
  createProfilesApi,
  duplicateProfileName,
  isProfileNameTaken,
  nextDefaultProfileName,
  profileErrorCode,
  type RpcClient,
} from './profiles.ts'
import { profileCreatedProps, profileCountProps, PROFILE_EVENT } from '../../services/profileEvents.ts'

type Call = { fn: string; args?: Record<string, unknown> }

function fakeClient(reply: (call: Call) => { data?: unknown; error?: unknown }): { client: RpcClient; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    client: {
      async rpc(fn, args) {
        const call = { fn, args }
        calls.push(call)
        const r = reply(call)
        return { data: r.data ?? null, error: r.error ?? null }
      },
    },
  }
}

// What supabase-js hands back for `raise exception using message = 'profile_limit'`.
const pgError = (code: string) => ({ code: 'P0001', message: code, details: 'English for developers', hint: null })

test('every RPC is called with the contract names and p_* arguments', async () => {
  const { client, calls } = fakeClient(({ fn }) => {
    if (fn === 'list_profiles') {
      return {
        data: [
          { id: 'a', name: 'Primary', display_order: 0, created_at: 'c', updated_at: 'u', hint: 'Engineer', resume_file_name: 'a.pdf', has_resume: true, is_active: true, locked: false },
          { id: 'b', name: 'Contract', display_order: 1, created_at: 'c', updated_at: 'u', hint: '', resume_file_name: null, has_resume: false, is_active: false, locked: true },
        ],
      }
    }
    if (fn === 'get_profile') return { data: { profile: { id: 'a' }, is_active: true, locked: false, custom_responses: [] } }
    if (fn === 'create_profile') return { data: 'new-id' }
    if (fn === 'delete_profile') return { data: { deleted_profile_id: 'b', resume_file_path: 'u/b/resume.pdf', active_profile_id: 'a' } }
    if (fn === 'save_profile') return { data: '2026-10-04T12:00:00Z' }
    return {}
  })
  const api = createProfilesApi(client)

  const list = await api.listProfiles()
  assert.equal(list.length, 2)
  assert.equal(list[1].locked, true)
  assert.equal(list[1].hint, null)

  await api.getProfile(null)
  assert.equal(await api.createProfile('Contract', 'a'), 'new-id')
  await api.createProfile('Blank')
  await api.renameProfile('b', 'Contracts')
  await api.setActiveProfile('b')
  const deleted = await api.deleteProfile('b')
  assert.deepEqual(deleted, { deleted_profile_id: 'b', resume_file_path: 'u/b/resume.pdf', active_profile_id: 'a' })
  await api.saveProfile('a', null, { custom_responses: [] })

  assert.deepEqual(calls, [
    { fn: 'list_profiles', args: undefined },
    { fn: 'get_profile', args: { p_profile_id: null } },
    { fn: 'create_profile', args: { p_name: 'Contract', p_copy_from: 'a' } },
    { fn: 'create_profile', args: { p_name: 'Blank', p_copy_from: null } },
    { fn: 'rename_profile', args: { p_profile_id: 'b', p_name: 'Contracts' } },
    { fn: 'set_active_profile', args: { p_profile_id: 'b' } },
    { fn: 'delete_profile', args: { p_profile_id: 'b' } },
    { fn: 'save_profile', args: { p_profile_id: 'a', p_profile: null, p_children: { custom_responses: [] } } },
  ])
})

test('P0001 messages map to codes and user copy; anything else is unknown', async () => {
  for (const code of ['not_authenticated', 'not_found', 'pro_required', 'profile_limit', 'name_taken', 'invalid_name', 'profile_locked', 'last_profile', 'invalid_payload'] as const) {
    const { client } = fakeClient(() => ({ error: pgError(code) }))
    await assert.rejects(
      () => createProfilesApi(client).createProfile('X'),
      (err: unknown) => {
        assert.ok(err instanceof ProfileError)
        assert.equal(err.code, code)
        assert.equal(err.message, PROFILE_ERROR_COPY[code])
        assert.doesNotMatch(err.message, /English for developers/)
        return true
      },
    )
  }
  assert.equal(profileErrorCode({ message: 'duplicate key value violates unique constraint' }), 'unknown')
  assert.equal(profileErrorCode(new Error('Failed to fetch')), 'unknown')
  assert.equal(PROFILE_ERROR_COPY.profile_limit, 'You can have up to 5 profiles.')
  assert.equal(PROFILE_ERROR_COPY.profile_locked, 'Resubscribe to use this profile again.')

  const { client: throwing } = fakeClient(() => {
    throw new Error('network down')
  })
  await assert.rejects(() => createProfilesApi(throwing).listProfiles(), (err: unknown) => {
    assert.ok(err instanceof ProfileError)
    assert.equal(err.code, 'unknown')
    return true
  })
})

test('default, duplicate and taken names follow the case-insensitive unique rule', () => {
  const existing = [
    { id: 'a', name: 'Primary' },
    { id: 'b', name: 'profile 2' },
  ]
  assert.equal(nextDefaultProfileName(existing), 'Profile 3')
  assert.equal(nextDefaultProfileName([{ id: 'a', name: 'Primary' }]), 'Profile 2')
  assert.equal(duplicateProfileName(existing, 'Primary'), 'Primary copy')
  assert.equal(duplicateProfileName([...existing, { id: 'c', name: 'PRIMARY COPY' }], 'Primary'), 'Primary copy 2')
  assert.ok(duplicateProfileName(existing, 'x'.repeat(60)).length <= 60)
  assert.equal(isProfileNameTaken(existing, '  primary '), true)
  assert.equal(isProfileNameTaken(existing, 'Primary', 'a'), false)
  assert.equal(isProfileNameTaken(existing, 'Contract'), false)
})

test('profile analytics carry counts and source, never names', () => {
  assert.equal(PROFILE_EVENT.created, 'profile_created')
  assert.equal(PROFILE_EVENT.switched, 'profile_switched')
  assert.equal(PROFILE_EVENT.renamed, 'profile_renamed')
  assert.equal(PROFILE_EVENT.deleted, 'profile_deleted')
  assert.equal(PROFILE_EVENT.lockedViewed, 'profile_locked_viewed')
  assert.equal(PROFILE_EVENT.paywallViewed, 'multi_profile_paywall_viewed')
  assert.deepEqual(profileCreatedProps({ source: 'blank', profileCount: 2 }), { source: 'blank', profile_count: 2 })
  assert.deepEqual(profileCreatedProps({ source: 'copy', profileCount: 3, resumeCopied: false }), {
    source: 'copy',
    profile_count: 3,
    resume_copied: false,
  })
  assert.deepEqual(profileCountProps(4, { was_active: true }), { profile_count: 4, was_active: true })
})
