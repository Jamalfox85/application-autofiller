// Client-side AES-256-GCM for Application Account passwords.
//
// Ciphertext format: `gfr1:<base64url iv>:<base64url ciphertext+tag>`.
// A value without that prefix is legacy plaintext and is returned unchanged.
// Empty passwords stay empty. Sealing an already-sealed value is a no-op, so
// a migration can run on every open without rewriting ciphertext or losing data.
//
// The key is not derived from a user password (sign-in is Google). It is the
// 32-byte per-user secret from ensure_user_account_key().
import type { ApplicationAccount, PersonalInfo } from '../types/index.ts'

export const ACCOUNT_SECRET_PREFIX = 'gfr1:'

const AAD = new TextEncoder().encode('gofillr.account-password.v1')

const SEALED_RE = /^gfr1:([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{22,})$/

export function isSealedPassword(value: unknown): value is string {
  return typeof value === 'string' && SEALED_RE.test(value)
}

export function hasSealedPassword(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  const record = info as Partial<PersonalInfo>
  if (isSealedPassword(record.accountPassword)) return true
  const accounts = record.applicationAccounts
  if (!Array.isArray(accounts)) return false
  return accounts.some((account) => account && isSealedPassword(account.password))
}

/** True when a non-empty password is still legacy plaintext. */
export function accountPasswordsNeedSeal(info: PersonalInfo | null | undefined): boolean {
  if (!info) return false
  if (needsSeal(info.accountPassword)) return true
  return (info.applicationAccounts ?? []).some((account) => needsSeal(account?.password))
}

function needsSeal(value: string | null | undefined): boolean {
  return !!value && !isSealedPassword(value)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function bytesFromBase64(value: string): Uint8Array {
  const clean = value.trim().replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4))
  const binary = atob(clean + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function importAccountKey(raw: Uint8Array): Promise<CryptoKey> {
  const copy = new Uint8Array(raw.byteLength)
  copy.set(raw)
  return crypto.subtle.importKey('raw', copy, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function importAccountKeyFromBase64(b64: string): Promise<CryptoKey> {
  return importAccountKey(bytesFromBase64(b64))
}

export async function sealPassword(plain: string, key: CryptoKey): Promise<string> {
  if (!plain || isSealedPassword(plain)) return plain
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
      key,
      new TextEncoder().encode(plain),
    ),
  )
  return `${ACCOUNT_SECRET_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(cipher)}`
}

export async function openPassword(stored: string, key: CryptoKey): Promise<string> {
  if (!stored || !isSealedPassword(stored)) return stored
  const match = SEALED_RE.exec(stored)
  if (!match) return stored
  const iv = bytesFromBase64(match[1])
  const data = bytesFromBase64(match[2])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
    key,
    data,
  )
  return new TextDecoder().decode(plain)
}

export interface LockedPasswords {
  accountPassword: string | null
  byId: Record<string, string>
}

export interface MigratedPasswords {
  opened: PersonalInfo
  sealed: PersonalInfo
  /** At least one legacy plaintext password was encrypted on this pass. */
  changed: boolean
  /** Ciphertext we could not open. Empty editor fields must keep these on save. */
  locked: LockedPasswords | null
}

// Opens sealed passwords for the editor and for fill. Legacy plaintext is left
// as plaintext in `opened` and encrypted in `sealed`. Already-sealed values are
// not re-encrypted, so a second pass is a no-op (`changed` stays false and the
// ciphertext strings are unchanged). A decrypt failure blanks that field in
// `opened` (so it is never typed into a form) and records the original
// ciphertext in `locked` so a later save does not wipe it.
export async function migrateAccountPasswords(
  info: PersonalInfo,
  key: CryptoKey,
): Promise<MigratedPasswords> {
  const locked: LockedPasswords = { accountPassword: null, byId: {} }
  let anyLocked = false
  let changed = false

  const legacy = info.accountPassword ?? ''
  let openedLegacy = legacy
  let sealedLegacy = legacy
  if (legacy && isSealedPassword(legacy)) {
    try {
      openedLegacy = await openPassword(legacy, key)
    } catch {
      openedLegacy = ''
      locked.accountPassword = legacy
      anyLocked = true
    }
  } else if (legacy) {
    sealedLegacy = await sealPassword(legacy, key)
    changed = true
  }

  let openedAccounts = info.applicationAccounts
  let sealedAccounts = info.applicationAccounts
  if (info.applicationAccounts) {
    openedAccounts = []
    sealedAccounts = []
    for (const account of info.applicationAccounts) {
      const password = account?.password ?? ''
      if (!password) {
        openedAccounts.push({ ...account })
        sealedAccounts.push({ ...account })
        continue
      }
      if (isSealedPassword(password)) {
        try {
          const plain = await openPassword(password, key)
          openedAccounts.push({ ...account, password: plain })
          sealedAccounts.push({ ...account })
        } catch {
          openedAccounts.push({ ...account, password: '' })
          sealedAccounts.push({ ...account })
          locked.byId[String(account.id)] = password
          anyLocked = true
        }
        continue
      }
      sealedAccounts.push({ ...account, password: await sealPassword(password, key) })
      openedAccounts.push({ ...account })
      changed = true
    }
  }

  return {
    opened: { ...info, accountPassword: openedLegacy, applicationAccounts: openedAccounts },
    sealed: { ...info, accountPassword: sealedLegacy, applicationAccounts: sealedAccounts },
    changed,
    locked: anyLocked ? locked : null,
  }
}

// Puts ciphertext back onto fields the editor left blank because decrypt failed.
// A field the user filled in (including a replacement password) is kept.
export function restoreLockedPasswords(
  info: PersonalInfo,
  locked: LockedPasswords | null | undefined,
): PersonalInfo {
  if (!locked) return info
  const next: PersonalInfo = { ...info }
  if (!String(next.accountPassword ?? '') && locked.accountPassword) {
    next.accountPassword = locked.accountPassword
  }
  if (next.applicationAccounts) {
    next.applicationAccounts = next.applicationAccounts.map((account) => {
      const saved = locked.byId[String(account.id)]
      if (!String(account.password ?? '') && saved) return { ...account, password: saved }
      return account
    })
  }
  return next
}

// Fill and the editor must not receive ciphertext. Fields that do not open
// become empty. Legacy plaintext is unchanged, so a profile that has not been
// migrated yet still fills.
export function lockSealedPasswords(info: PersonalInfo | null | undefined): LockedPasswords | null {
  if (!info) return null
  const locked: LockedPasswords = { accountPassword: null, byId: {} }
  let any = false
  if (isSealedPassword(info.accountPassword)) {
    locked.accountPassword = info.accountPassword
    any = true
  }
  for (const account of info.applicationAccounts ?? []) {
    if (account && isSealedPassword(account.password)) {
      locked.byId[String(account.id)] = account.password
      any = true
    }
  }
  return any ? locked : null
}

export function blankSealedPasswords<T>(info: T): T {
  if (!info || typeof info !== 'object') return info
  const record = info as PersonalInfo
  const next: PersonalInfo = { ...record }
  if (isSealedPassword(next.accountPassword)) next.accountPassword = ''
  if (Array.isArray(next.applicationAccounts)) {
    next.applicationAccounts = next.applicationAccounts.map((account: ApplicationAccount) =>
      isSealedPassword(account?.password) ? { ...account, password: '' } : account,
    )
  }
  return next as T
}
