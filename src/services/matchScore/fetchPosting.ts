import { postingUrlAllowed } from './postingHosts.ts'

const MAX_POSTING_BYTES = 2_000_000

export async function fetchAllowedPosting(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; body: string } | { ok: false }> {
  if (!postingUrlAllowed(rawUrl)) return { ok: false }
  try {
    const response = await fetchImpl(rawUrl, { method: 'GET', redirect: 'manual' })
    if (response.type === 'opaqueredirect' || response.status === 0) return { ok: false }
    if (response.status >= 300 && response.status < 400) return { ok: false }
    if (!response.ok) return { ok: false }
    const body = await response.text()
    if (body.length > MAX_POSTING_BYTES) return { ok: false }
    return { ok: true, body }
  } catch {
    return { ok: false }
  }
}
