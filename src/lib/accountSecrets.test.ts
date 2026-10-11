import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { cloneDefaultPersonalInfo } from './personalInfoDefaults.ts'
import { dbRowsToProfile, profileToDbRows } from './sync/profileRows.ts'
import { finalizeTrackedProperties } from '../services/mixpanelConfig.ts'
import {
  accountPasswordsNeedSeal,
  blankSealedPasswords,
  importAccountKey,
  isSealedPassword,
  lockSealedPasswords,
  migrateAccountPasswords,
  restoreLockedPasswords,
  sealPassword,
} from './accountSecrets.ts'
import type { PersonalInfo } from '../types/index.ts'

const PROFILE = '7b0c1f4e-2d3a-4c5b-9e8f-0a1b2c3d4e5f'
const LEGACY_ACCOUNT = 'legacy-portal-secret-9f3a'
const LEGACY_ROW = 'workday-account-secret-9f3a'

function legacyProfile(): PersonalInfo {
  return dbRowsToProfile({
    profile: {
      id: PROFILE,
      first_name: 'Ada',
      email: 'ada@example.com',
      account_email: 'ada.workday@example.com',
      account_password: LEGACY_ACCOUNT,
    },
    application_accounts: [
      {
        portal: 'Workday',
        email: 'ada.workday@example.com',
        password: LEGACY_ROW,
        require_confirmation: true,
      },
    ],
  })
}

async function key(): Promise<CryptoKey> {
  return importAccountKey(crypto.getRandomValues(new Uint8Array(32)))
}

test('a pre-encryption profile is sealed once and still opens to the same passwords', async () => {
  const legacy = legacyProfile()
  assert.equal(legacy.accountPassword, LEGACY_ACCOUNT)
  assert.equal(legacy.applicationAccounts?.[0].password, LEGACY_ROW)
  assert.equal(accountPasswordsNeedSeal(legacy), true)
  assert.equal(isSealedPassword(legacy.accountPassword), false)

  const cryptoKey = await key()
  const first = await migrateAccountPasswords(legacy, cryptoKey)
  assert.equal(first.changed, true)
  assert.equal(first.locked, null)
  assert.equal(first.opened.accountPassword, LEGACY_ACCOUNT)
  assert.equal(first.opened.applicationAccounts?.[0].password, LEGACY_ROW)
  assert.equal(first.opened.applicationAccounts?.[0].email, 'ada.workday@example.com')
  assert.equal(first.opened.firstName, 'Ada')
  assert.equal(isSealedPassword(first.sealed.accountPassword), true)
  assert.equal(isSealedPassword(first.sealed.applicationAccounts?.[0].password), true)
  const sealedJson = JSON.stringify(first.sealed)
  assert.equal(sealedJson.includes(LEGACY_ACCOUNT), false)
  assert.equal(sealedJson.includes(LEGACY_ROW), false)
  assert.equal(first.sealed.accountEmail, 'ada.workday@example.com')

  const rows = profileToDbRows(first.sealed, PROFILE)
  assert.equal(rows.profile.account_password, first.sealed.accountPassword)
  assert.equal(rows.children.application_accounts[0].password, first.sealed.applicationAccounts?.[0].password)
  assert.equal(String(rows.profile.account_password).includes(LEGACY_ACCOUNT), false)

  const second = await migrateAccountPasswords(first.sealed, cryptoKey)
  assert.equal(second.changed, false)
  assert.equal(second.sealed.accountPassword, first.sealed.accountPassword)
  assert.equal(second.sealed.applicationAccounts?.[0].password, first.sealed.applicationAccounts?.[0].password)
  assert.equal(second.opened.accountPassword, LEGACY_ACCOUNT)
  assert.equal(second.opened.applicationAccounts?.[0].password, LEGACY_ROW)

  const fromDb = dbRowsToProfile({
    profile: { ...rows.profile, id: PROFILE },
    application_accounts: rows.children.application_accounts,
  })
  const third = await migrateAccountPasswords(fromDb, cryptoKey)
  assert.equal(third.changed, false)
  assert.equal(third.opened.accountPassword, LEGACY_ACCOUNT)
  assert.equal(third.opened.applicationAccounts?.[0].password, LEGACY_ROW)
})

test('sealing is authenticated: a flipped ciphertext does not replace the stored value', async () => {
  const cryptoKey = await key()
  const sealed = await sealPassword(LEGACY_ROW, cryptoKey)
  const bodyAt = sealed.lastIndexOf(':') + 1
  const mid = bodyAt + Math.floor((sealed.length - bodyAt) / 2)
  const flippedChar = sealed[mid] === 'A' ? 'B' : 'A'
  const flipped = `${sealed.slice(0, mid)}${flippedChar}${sealed.slice(mid + 1)}`
  const info: PersonalInfo = {
    ...cloneDefaultPersonalInfo(),
    accountPassword: flipped,
    applicationAccounts: [
      { id: 4, portal: 'Workday', email: 'a@x.com', password: sealed, requireConfirmation: false },
    ],
  }
  const migrated = await migrateAccountPasswords(info, cryptoKey)
  assert.equal(migrated.changed, false)
  assert.equal(migrated.sealed.accountPassword, flipped)
  assert.equal(migrated.opened.accountPassword, '')
  assert.equal(migrated.opened.applicationAccounts?.[0].password, LEGACY_ROW)
  assert.equal(migrated.locked?.accountPassword, flipped)
  const restored = restoreLockedPasswords(
    { ...migrated.opened, accountPassword: '' },
    migrated.locked,
  )
  assert.equal(restored.accountPassword, flipped)
  const replaced = restoreLockedPasswords(
    { ...migrated.opened, accountPassword: 'new-secret' },
    migrated.locked,
  )
  assert.equal(replaced.accountPassword, 'new-secret')
})

test('a wrong key does not destroy ciphertext, and empty passwords stay empty', async () => {
  const sealed = await sealPassword(LEGACY_ACCOUNT, await key())
  const info: PersonalInfo = {
    ...cloneDefaultPersonalInfo(),
    accountPassword: '',
    applicationAccounts: [
      { id: 1, portal: 'Greenhouse', email: 'a@x.com', password: sealed, requireConfirmation: true },
      { id: 2, portal: 'iCIMS', email: 'b@x.com', password: '', requireConfirmation: false },
    ],
  }
  const migrated = await migrateAccountPasswords(info, await key())
  assert.equal(migrated.changed, false)
  assert.equal(migrated.sealed.applicationAccounts?.[0].password, sealed)
  assert.equal(migrated.sealed.applicationAccounts?.[1].password, '')
  assert.equal(migrated.opened.applicationAccounts?.[0].password, '')
  assert.equal(isSealedPassword(migrated.sealed.accountPassword), false)
  const blanked = blankSealedPasswords(info)
  assert.equal(blanked.applicationAccounts?.[0].password, '')
  const held = lockSealedPasswords(info)
  assert.equal(held?.byId['1'], sealed)
  assert.equal(
    restoreLockedPasswords(blanked, held).applicationAccounts?.[0].password,
    sealed,
  )
  assert.equal(blankSealedPasswords({ ...info, applicationAccounts: [{ ...info.applicationAccounts![0], password: 'still-plain' }] }).applicationAccounts?.[0].password, 'still-plain')
})

test('two seals of the same password differ and both open', async () => {
  const cryptoKey = await key()
  const left = await sealPassword(LEGACY_ROW, cryptoKey)
  const right = await sealPassword(LEGACY_ROW, cryptoKey)
  assert.notEqual(left, right)
  const openedLeft = await migrateAccountPasswords(
    { ...cloneDefaultPersonalInfo(), accountPassword: left },
    cryptoKey,
  )
  const openedRight = await migrateAccountPasswords(
    { ...cloneDefaultPersonalInfo(), accountPassword: right },
    cryptoKey,
  )
  assert.equal(openedLeft.opened.accountPassword, LEGACY_ROW)
  assert.equal(openedRight.opened.accountPassword, LEGACY_ROW)
})

test('Mixpanel properties drop portal passwords and the crypto modules do not track them', () => {
  const cleaned = finalizeTrackedProperties(
    {
      ats: 'workday',
      password: LEGACY_ROW,
      accountPassword: LEGACY_ACCOUNT,
      account_password: 'column-secret',
      applicationAccounts: [{ email: 'ada.workday@example.com', password: LEGACY_ROW }],
    },
    'test',
  )
  const encoded = JSON.stringify(cleaned)
  assert.equal(encoded.includes(LEGACY_ROW), false)
  assert.equal(encoded.includes(LEGACY_ACCOUNT), false)
  assert.equal(encoded.includes('column-secret'), false)
  assert.equal(encoded.includes('password'), false)
  assert.equal(cleaned.ats, 'workday')
  const applicationAccounts = cleaned.applicationAccounts as { email?: string }[]
  assert.equal(applicationAccounts[0].email, 'ada.workday@example.com')

  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const sources = [
    read('./accountSecrets.ts'),
    read('./accountKey.ts'),
    read('./accountKeyCache.ts'),
    read('./openStoredPersonalInfo.ts'),
    read('../composables/usePersonalInfo.ts'),
  ].join('\n')
  assert.equal(/trackEvent|trackMixpanel|mixpanel\.track/.test(sources), false)
  assert.match(read('./accountKey.ts'), /Account encryption key unavailable/)
  assert.equal(/console\.(log|debug|info|warn|error)\([^)]*\$\{/.test(read('./accountKey.ts')), false)
})
