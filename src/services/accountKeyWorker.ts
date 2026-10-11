// Service-worker side of the account-password key. background.js imports the
// bundled file. The popup also calls ensureAccountKey directly.
import { ensureAccountKey } from '../lib/accountKey.ts'
import { openAccountKeySession } from '../lib/accountKeyCache.ts'
import { migrateStoredAccountPasswords } from '../lib/migrateStoredAccountPasswords.ts'

export { openAccountKeySession }

export async function ensureAccountKeyInSession(): Promise<boolean> {
  // Content scripts cannot read the key until this resolves. Await it before
  // the cache write so a reader that races the worker still sees the record.
  await openAccountKeySession()
  const key = await ensureAccountKey()
  if (!key) return false
  try {
    await migrateStoredAccountPasswords()
  } catch {
    console.error('Could not encrypt saved account passwords')
  }
  return true
}
