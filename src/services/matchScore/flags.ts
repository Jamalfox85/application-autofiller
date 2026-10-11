// Per-ATS switches. Default on only when a captured fixture shows the description
// and the extractor returns that text. Fetched postings stay on the documented
// response shapes and the posting-host allowlist. A title, an apply form, or an
// iframe shell is not a description. A missing description returns null, so the
// card stays hidden.
// Greenhouse, Ashby, Lever, and Workable: documented posting responses.
// iCIMS: .iCIMS_JobContent on the job content frame. The shell document does not
// contain it. Jobvite, BambooHR, and Workday stay off: captured apply/job pages
// have no description body, and no unauthenticated posting host is confirmed.

const DEFAULT_ON = new Set(['greenhouse', 'ashby', 'lever', 'workable', 'icims'])

function flagString(read: () => unknown): string | undefined {
  try {
    const value = read()
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

function enabled(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

export function matchScoreEnabled(override?: string): boolean {
  const raw =
    override !== undefined ? override : flagString(() => import.meta.env.VITE_MATCH_SCORE_ENABLED)
  return enabled(raw, true)
}

function atsFlag(ats: string): string | undefined {
  switch (ats) {
    case 'greenhouse':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_GREENHOUSE)
    case 'ashby':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_ASHBY)
    case 'lever':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_LEVER)
    case 'jobvite':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_JOBVITE)
    case 'workable':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_WORKABLE)
    case 'bamboohr':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_BAMBOOHR)
    case 'icims':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_ICIMS)
    case 'workday':
      return flagString(() => import.meta.env.VITE_MATCH_SCORE_WORKDAY)
    default:
      return undefined
  }
}

export function atsExtractorEnabled(ats: string, override?: string): boolean {
  if (!matchScoreEnabled()) return false
  const raw = override !== undefined ? override : atsFlag(ats)
  return enabled(raw, DEFAULT_ON.has(ats))
}

export function atsDefaultsOn(ats: string): boolean {
  return DEFAULT_ON.has(ats)
}
