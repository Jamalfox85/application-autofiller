import { CustomResponse } from '@/types'

function tokenize(normStr: string): string[] {
  if (!normStr) return []
  return String(normStr)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function normalizeText(s: string): string {
  // Use only if your saved response title/tags are not already normalized
  return String(s ?? '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function coverageRatio(titleTokens: string[], fieldTokenSet: Set<string>): number {
  if (!Array.isArray(titleTokens) || titleTokens.length === 0) return 0

  let hit = 0
  for (const t of titleTokens) {
    if (fieldTokenSet.has(t)) hit++
  }
  return hit / titleTokens.length
}

export function matchCustomResponse(fieldText: string, customResponses?: CustomResponse[]) {
  //   console.log('Matching custom response for fieldText:', fieldText)
  //   console.log('Available custom responses:', customResponses)
  if (!fieldText || !Array.isArray(customResponses) || customResponses.length === 0) {
    return null
  }

  // Build token set once for fast membership checks
  const fieldTokens = new Set(tokenize(fieldText))

  let best = null

  for (const r of customResponses) {
    const text = String(r?.text ?? '').trim()
    if (!text) continue

    // Keep this small and tuned to your domain; expand as needed.
    const STOPWORDS = new Set<string>([])

    const titleNorm = normalizeText(r?.title ?? '')
    const titleTokens = tokenize(titleNorm).filter((t) => !STOPWORDS.has(t))
    const titleCoverage = coverageRatio(titleTokens, fieldTokens) // 0..1

    // Tag hits (>= 3)
    // Treat "tag found" as: any token from that tag exists in fieldTokens.
    const tags = Array.isArray(r?.tags) ? r.tags : []
    const tagTokens = tags.map(normalizeText).flatMap(tokenize).filter(Boolean)

    const uniqueTagTokens = [...new Set(tagTokens)]
    let tagHits = 0
    for (const t of uniqueTagTokens) {
      if (fieldTokens.has(t)) tagHits++
    }

    const passes = tagHits >= 3 || titleCoverage >= 0.8
    if (!passes) continue

    // Prefer title match strongly; tags are secondary
    const score = titleCoverage * 1000 + tagHits * 10 + titleTokens.length

    if (!best || score > best.score) {
      best = { score, text }
    }
  }

  return best ? best.text : null
}
