// Hostname → ATS slug used by apply-session telemetry. Null means this page is not
// a known ATS host, so we don't open an apply session for it.
const ATS_HOST_RULES: Array<{ fragment: string; ats: string }> = [
  { fragment: 'greenhouse.io', ats: 'greenhouse' },
  { fragment: 'lever.co', ats: 'lever' },
  { fragment: 'myworkday', ats: 'workday' },
  { fragment: 'workday.com', ats: 'workday' },
  { fragment: 'ashbyhq.com', ats: 'ashby' },
  { fragment: 'bamboohr.com', ats: 'bamboohr' },
  { fragment: 'icims.com', ats: 'icims' },
  { fragment: 'smartrecruiters.com', ats: 'smartrecruiters' },
  { fragment: 'jobvite.com', ats: 'jobvite' },
  { fragment: 'ultipro.com', ats: 'ultipro' },
  { fragment: 'breezy.hr', ats: 'breezy' },
  { fragment: 'recruitee.com', ats: 'recruitee' },
  { fragment: 'jazz.co', ats: 'jazzhr' },
  { fragment: 'applytojob.com', ats: 'jazzhr' },
  { fragment: 'dayforcehcm', ats: 'dayforce' },
  { fragment: 'taleo', ats: 'taleo' },
]

export type AtsPageContext = {
  hostname: string
  /** Full page URL when available — used for Greenhouse embed query params (gh_jid). */
  href?: string | null
  /**
   * Optional document for Greenhouse DOM / iframe markers on non-greenhouse.io hosts
   * (e.g. carvana.com careers apply that embeds boards.greenhouse.io).
   */
  document?: Pick<Document, 'getElementById' | 'querySelector'> | null
}

export function atsFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase()
  for (const rule of ATS_HOST_RULES) {
    if (host.includes(rule.fragment)) return rule.ats
  }
  return null
}

/** Greenhouse job id on embedded apply pages (e.g. carvana.com/careers/apply?gh_jid=…). */
export function hrefHasGreenhouseJobId(href: string): boolean {
  try {
    const url = new URL(href)
    if (url.searchParams.has('gh_jid')) return true
    // Some SPA hosts put query params in the hash.
    if (url.hash.includes('?')) {
      const hashQuery = url.hash.slice(url.hash.indexOf('?') + 1)
      if (new URLSearchParams(hashQuery).has('gh_jid')) return true
    }
    return false
  } catch {
    return /(?:[?&#]|^)gh_jid=/i.test(href)
  }
}

export function documentHasAshbyMarkers(doc: Pick<Document, 'querySelector'>): boolean {
  // Classes and system-field paths from Ashby's hosted application form. An iframe
  // pointed at jobs.ashbyhq.com is a separate document; the content script runs
  // there with all_frames and matches the hostname rule.
  if (doc.querySelector('.ashby-application-form-container')) return true
  if (doc.querySelector('.ashby-application-form-field-entry')) return true
  if (doc.querySelector('[data-field-path^="_systemfield_"]')) return true
  return false
}

export function documentHasGreenhouseMarkers(
  doc: Pick<Document, 'getElementById' | 'querySelector'>,
): boolean {
  // Classic and modern Greenhouse apply roots used by siteRules/greenhouse.ts.
  if (doc.getElementById('application-form') || doc.getElementById('application_form')) {
    return true
  }
  // Embedded boards iframe on a careers host.
  if (doc.querySelector('iframe[src*="greenhouse.io"]')) return true
  return false
}

/**
 * Shared ATS detection for fillContract / trackFillContract and ATS site rules.
 * Prefer hostname rules; fall back to Greenhouse embed signals, then Ashby form markup
 * when the top-level host is not the ATS itself.
 */
export function detectAts(input: AtsPageContext): string | null {
  const byHost = atsFromHostname(input.hostname)
  if (byHost) return byHost

  if (input.href && hrefHasGreenhouseJobId(input.href)) return 'greenhouse'
  if (input.document && documentHasGreenhouseMarkers(input.document)) return 'greenhouse'
  if (input.document && documentHasAshbyMarkers(input.document)) return 'ashby'

  return null
}
