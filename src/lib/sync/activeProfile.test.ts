import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVE_PROFILE_KEY,
  LEGACY_PROFILE_ROSTER_KEY,
  activeMirrorFromList,
  autofillButtonLabel,
  clearLegacyProfileRoster,
  editedAgo,
  fillToastSubtitle,
  parseActiveProfile,
  readActiveProfileId,
  truncateProfileName,
  writeProfileMirrors,
  type StorageAreaLike,
} from './activeProfile.ts'

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial }
  const sets: Record<string, unknown>[] = []
  const removed: string[] = []
  const storage: StorageAreaLike = {
    async get(keys) {
      if (keys == null) return { ...data }
      const list = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]))
    },
    async set(items) {
      sets.push(items)
      Object.assign(data, items)
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        removed.push(key)
        delete data[key]
      }
    },
  }
  return { storage, data, sets, removed }
}

test('a swap rewrites personalInfo, customResponses and activeProfile in one storage write', async () => {
  const mem = memoryStorage({
    personalInfo: { firstName: 'Old' },
    customResponses: [{ id: 1, title: 'old', text: '', tags: [] }],
    activeProfile: { id: 'a', name: 'Primary', profileCount: 2 },
  })
  const list = [
    { id: 'a', name: 'Primary', is_active: false },
    { id: 'b', name: 'Contract', is_active: true },
  ]
  const active = activeMirrorFromList(list)
  assert.deepEqual(active, { id: 'b', name: 'Contract', profileCount: 2 })

  await writeProfileMirrors(mem.storage, {
    personalInfo: { firstName: 'New' },
    customResponses: [],
    activeProfile: active,
  })
  assert.equal(mem.sets.length, 1)
  assert.deepEqual(Object.keys(mem.sets[0]).sort(), ['activeProfile', 'customResponses', 'personalInfo'])
  assert.deepEqual(mem.data.personalInfo, { firstName: 'New' })
  assert.deepEqual(mem.data.customResponses, [])
  assert.equal(await readActiveProfileId(mem.storage), 'b')
})

test('the legacy profileRoster key (portal passwords) is removed', async () => {
  const mem = memoryStorage({ [LEGACY_PROFILE_ROSTER_KEY]: { activeId: 'primary', profiles: [] }, personalInfo: {} })
  await clearLegacyProfileRoster(mem.storage)
  assert.equal(LEGACY_PROFILE_ROSTER_KEY in mem.data, false)
  assert.ok('personalInfo' in mem.data)
  assert.deepEqual(mem.removed, ['profileRoster'])
})

test('the profile name shows on the button and toast only with 2+ profiles', () => {
  const single = { id: 'a', name: 'Primary', profileCount: 1 }
  const multi = { id: 'b', name: 'Contract', profileCount: 2 }
  assert.equal(autofillButtonLabel(null), 'Auto-fill application')
  assert.equal(autofillButtonLabel(single), 'Auto-fill application')
  assert.equal(autofillButtonLabel(multi), 'Autofill as Contract')
  assert.equal(fillToastSubtitle(single), 'Autofill completed')
  assert.equal(fillToastSubtitle(multi), 'Filled with Contract')
  assert.equal(truncateProfileName('Senior backend engineer roles', 18), 'Senior backend en…')
  assert.equal(truncateProfileName(' Short '), 'Short')
})

test('the mirror parser rejects junk and clamps the count', () => {
  assert.equal(parseActiveProfile(null), null)
  assert.equal(parseActiveProfile('{"id":"a"}'), null)
  assert.equal(parseActiveProfile({ name: 'x' }), null)
  assert.deepEqual(parseActiveProfile({ id: 'a', name: 'P', profileCount: 0 }), { id: 'a', name: 'P', profileCount: 1 })
  assert.equal(ACTIVE_PROFILE_KEY, 'activeProfile')
})

test('edited-ago labels for the Profiles list', () => {
  const now = Date.parse('2026-10-04T12:00:00Z')
  assert.equal(editedAgo('2026-10-04T11:59:50Z', now), 'edited just now')
  assert.equal(editedAgo('2026-10-04T11:30:00Z', now), 'edited 30m ago')
  assert.equal(editedAgo('2026-10-01T12:00:00Z', now), 'edited 3d ago')
  assert.equal(editedAgo('nope', now), '')
})
