// Decrypts account passwords on the way into a fill or the popup. Legacy
// plaintext passes through. Sealed values with no key become empty so the
// ciphertext is never typed into a password field or shown in the editor.
import { hasSealedPassword, migrateAccountPasswords, blankSealedPasswords } from './accountSecrets.ts'
import { readCachedAccountKey } from './accountKeyCache.ts'
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
  if (!key) return blankSealedPasswords(info)
  try {
    const migrated = await migrateAccountPasswords(info as PersonalInfo, key)
    return migrated.opened as T
  } catch {
    return blankSealedPasswords(info)
  }
}
