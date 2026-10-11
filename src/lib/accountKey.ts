// Fetches the signed-in user's AES key. The RPC creates it on first call.
// A missing function (migration not applied yet) or a network failure returns
// null. Callers then keep legacy plaintext and try again on the next open.
// Nothing here is sent to Mixpanel, and the key itself is never logged.
import { supabase } from './supabase.ts'
import { cacheAccountKey, readCachedAccountKey } from './accountKeyCache.ts'

let inflight: Promise<CryptoKey | null> | null = null

async function fetchAccountKey(): Promise<CryptoKey | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? ''
    if (!userId) return null

    const cached = await readCachedAccountKey(userId)
    if (cached) return cached

    const { data, error } = await supabase.rpc('ensure_user_account_key')
    if (error || typeof data !== 'string' || !data.trim()) {
      console.error('Account encryption key unavailable')
      return null
    }
    const {
      data: { session: latest },
    } = await supabase.auth.getSession()
    if (latest?.user?.id !== userId) return null
    const key = await cacheAccountKey(userId, data)
    if (!key) console.error('Account encryption key unavailable')
    return key
  } catch {
    console.error('Account encryption key unavailable')
    return null
  }
}

export function ensureAccountKey(): Promise<CryptoKey | null> {
  if (!inflight) {
    inflight = fetchAccountKey().finally(() => {
      inflight = null
    })
  }
  return inflight
}
