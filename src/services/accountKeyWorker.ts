// Service-worker side of the account-password key. background.js imports the
// bundled file. The popup also calls ensureAccountKey directly.
import { ensureAccountKey } from '../lib/accountKey.ts'
import { migrateStoredAccountPasswords } from '../lib/migrateStoredAccountPasswords.ts'

export async function ensureAccountKeyInSession(): Promise<boolean> {
  const key = await ensureAccountKey()
  if (!key) return false
  try {
    await migrateStoredAccountPasswords()
  } catch {
    console.error('Could not encrypt saved account passwords')
  }
  return true
}
