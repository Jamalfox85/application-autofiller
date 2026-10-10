// timestamp (ms) + site is the identity of a fill. Empty and missing sites are the same key:
// the row is stored with site null, and the unique index treats those nulls as equal.
export function fillHistoryEntryKey(entry: { timestamp?: number; site?: string | null }): string {
  return `${entry.timestamp ?? ''}|${entry.site || ''}`
}

// Keeps the first row of each key. Callers pass newest-first when that is the row to show.
export function dedupeFillHistory<T extends { timestamp?: number; site?: string | null }>(entries: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const entry of entries) {
    const key = fillHistoryEntryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}
