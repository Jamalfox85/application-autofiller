// Decrypts account passwords on the way into a fill or the popup. Legacy
// plaintext passes through. Sealed values with no key become empty so the
// ciphertext is never typed into a password field or shown in the editor.
import { hasSealedPassword, migrateAccountPasswords, blankSealedPasswords, isSealedPassword } from './accountSecrets.ts'
import { readCachedAccountKey } from './accountKeyCache.ts'
import { markLockedPasswords } from './accountPasswordFill.ts'
import type { PersonalInfo } from '../types/index.ts'

async function requestKeyFromWorker(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return
    await chrome.runtime.sendMessage({ action: 'ensureAccountKey' })
  } catch {
    // The worker may be restarting. The fill uses legacy plaintext or skips
    // a sealed password rather than writing ciphertext.
  }
}

export async function openStoredPersonalInfo<T>(info: T): Promise<T> {
  if (!hasSealedPassword(info)) return info
  let key = await readCachedAccountKey()
  if (!key) {
    await requestKeyFromWorker()
    key = await readCachedAccountKey()
  }
  if (!key) return blankLocked(info)
  try {
    const migrated = await migrateAccountPasswords(info as PersonalInfo, key)
    if (!migrated.locked) return migrated.opened as T
    return markLockedPasswords(
      migrated.opened as T,
      !!migrated.locked.accountPassword,
      Object.keys(migrated.locked.byId),
    )
  } catch {
    return blankLocked(info)
  }
}

function sealedAccountIds(info: unknown): string[] {
  const accounts = (info as PersonalInfo | null)?.applicationAccounts
  if (!Array.isArray(accounts)) return []
  const ids: string[] = []
  for (const account of accounts) {
    if (account && isSealedPassword(account.password)) ids.push(String(account.id))
  }
  return ids
}

function blankLocked<T>(info: T): T {
  const legacy = isSealedPassword((info as PersonalInfo | null)?.accountPassword)
  return markLockedPasswords(blankSealedPasswords(info), legacy, sealedAccountIds(info))
}
