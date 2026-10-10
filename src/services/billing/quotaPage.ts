// Free quota is one charge per tab the user is looking at, not one charge per
// frame and not one charge per click. The service worker is the only place
// every frame of a tab shares, so the claim lives there.

import { calendarWeekKey } from './quota.ts'

export { calendarWeekKey }

// Drop the hash so a multi-step form that only changes #step does not count
// again. Keep the query: job ids often live there.
export function quotaPageKey(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    parsed.hash = ''
    return `${parsed.origin}${parsed.pathname}${parsed.search}`
  } catch {
    return trimmed.split('#')[0]
  }
}

export function decideQuotaClaim(
  claims: Record<string, string> | null | undefined,
  pageKey: string,
  week: string,
): { claimed: boolean; claims: Record<string, string> } {
  const current: Record<string, string> = {}
  for (const [key, value] of Object.entries(claims ?? {})) {
    if (value === week) current[key] = value
  }
  if (!pageKey) return { claimed: false, claims: current }
  if (current[pageKey] === week) return { claimed: false, claims: current }
  current[pageKey] = week
  return { claimed: true, claims: current }
}

export function forgetQuotaClaim(
  claims: Record<string, string> | null | undefined,
  pageKey: string,
): Record<string, string> {
  if (!pageKey || !claims || !(pageKey in claims)) return { ...(claims ?? {}) }
  const next = { ...claims }
  delete next[pageKey]
  return next
}
