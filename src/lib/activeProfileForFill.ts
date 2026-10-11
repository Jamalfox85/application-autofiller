import { dbRowsToProfile } from './sync/profileRows.ts'

export type ActiveProfileFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

export type FetchedActiveProfile = {
  id: string
  personalInfo: ReturnType<typeof dbRowsToProfile>
}

// True when the profile we fetched is still the one the fill should use.
// A swap that lands while the request is in flight must not overwrite the new
// mirror with the previous profile.
export function fetchedProfileStillActive(
  beforeId: string | null,
  afterId: string | null,
  fetchedId: string,
): boolean {
  const fetched = fetchedId.trim()
  if (beforeId && fetched && beforeId !== fetched) return false
  if (beforeId && afterId && beforeId !== afterId) return false
  if (!beforeId && afterId && fetched && afterId !== fetched) return false
  return true
}

function bundleFromRpc(json: unknown): { profile: Record<string, unknown> } | null {
  const row = Array.isArray(json) ? json[0] : json
  if (!row || typeof row !== 'object') return null
  const record = row as { profile?: unknown }
  if (!record.profile || typeof record.profile !== 'object') return null
  return record as { profile: Record<string, unknown> }
}

// The same get_profile read the popup uses, without supabase-js. Apply pages
// block that request from the content script, so the service worker calls this.
export async function fetchActiveProfileForFill(input: {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  profileId: string | null
  fetchImpl: ActiveProfileFetch
}): Promise<FetchedActiveProfile | null> {
  const base = input.supabaseUrl.replace(/\/$/, '')
  if (!base || !input.anonKey.trim() || !input.accessToken.trim()) return null
  let response: { ok: boolean; json: () => Promise<unknown> }
  try {
    response = await input.fetchImpl(`${base}/rest/v1/rpc/get_profile`, {
      method: 'POST',
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_profile_id: input.profileId }),
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return null
  }
  const bundle = bundleFromRpc(json)
  if (!bundle) return null
  const id = typeof bundle.profile.id === 'string' ? bundle.profile.id : input.profileId ?? ''
  return { id, personalInfo: dbRowsToProfile(bundle) }
}
