export function tokenize(normStr: string): string[] {
  if (!normStr) return []
  return String(normStr)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

export function normalizeText(s: string): string {
  // Use only if your saved response title/tags are not already normalized
  return String(s ?? '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function coverageRatio(titleTokens: string[], fieldTokenSet: Set<string>): number {
  if (!Array.isArray(titleTokens) || titleTokens.length === 0) return 0

  let hit = 0
  for (const t of titleTokens) {
    if (fieldTokenSet.has(t)) hit++
  }
  return hit / titleTokens.length
}
