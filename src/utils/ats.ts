// Hostname → ATS slug used by apply-session telemetry. Null means this page is not
// a known ATS host, so we don't open an apply session for it.
const ATS_HOST_RULES: Array<{ fragment: string; ats: string }> = [
  { fragment: 'greenhouse.io', ats: 'greenhouse' },
  // Hosted Lever apply (jobs.lever.co and any other *.lever.co host). Checked
  // before Greenhouse embed markers so a Lever form id="application-form" stays lever.
  { fragment: 'lever.co', ats: 'lever' },
  { fragment: 'myworkday', ats: 'workday' },
  { fragment: 'workday.com', ats: 'workday' },
  { fragment: 'ashbyhq.com', ats: 'ashby' },
  { fragment: 'bamboohr.com', ats: 'bamboohr' },
  { fragment: 'icims.com', ats: 'icims' },
  // Hosted Jobvite career sites: jobs.jobvite.com/{company}/job/{id} and /apply,
  // plus the older /careers/{company}/job/{id}/apply path. Any other *.jobvite.com
  // host (including the candidate portal) tags as jobvite. The apply filler only
  // writes inside the Jobvite apply form.
  { fragment: 'jobvite.com', ats: 'jobvite' },
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

// Hosted Workable apply (apply.workable.com/{account}/j/{id} and /apply, plus the
// EEO step). Marketing hosts such as www.workable.com are not apply pages.
export function isWorkableApplyHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'apply.workable.com' || host.endsWith('.apply.workable.com')
}

export function atsFromHostname(hostname: string): string | null {
  if (isWorkableApplyHost(hostname)) return 'workable'
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

function metaContent(doc: Pick<Document, 'querySelector'>, name: string): string {
  const meta = doc.querySelector(`meta[name="${name}"]`)
  if (!meta || typeof meta.getAttribute !== 'function') return ''
  return (meta.getAttribute('content') || '').trim().toLowerCase()
}

// The careers shell sets meta name="domain" content="workable.com" and renders
// [data-ui="application-form"] or [data-ui="eeoc-form"]. A bare meta tag is not
// enough: www.workable.com must stay untagged.
export function documentHasWorkableForm(doc: Pick<Document, 'querySelector'>): boolean {
  if (metaContent(doc, 'domain') !== 'workable.com') return false
  return !!(
    doc.querySelector('[data-ui="application-form"]') || doc.querySelector('[data-ui="eeoc-form"]')
  )
}

// Parent page that iframes the hosted apply flow. The fill itself runs in the
// frame (hostname apply.workable.com). #whr_embed_hook is a job list, not a form.
export function documentHasWorkableEmbed(doc: Pick<Document, 'querySelector'>): boolean {
  return !!doc.querySelector('iframe[src*="apply.workable.com"]')
}

export function documentHasWorkableMarkers(doc: Pick<Document, 'querySelector'>): boolean {
  return documentHasWorkableEmbed(doc) || documentHasWorkableForm(doc)
}

/**
 * Shared ATS detection for fillContract / trackFillContract and ATS site rules.
 * Prefer hostname rules, then Greenhouse embed signals (gh_jid / application form).
 * Ashby v1 is hostname-only (*.ashbyhq.com). Embedded Ashby forms on other hosts
 * are deferred, including when the same classes show up on a careers site.
 * Workable embeds are recognized after Greenhouse so a Greenhouse form keeps
 * its tag when both markers are on the page.
 */
export function detectAts(input: AtsPageContext): string | null {
  const byHost = atsFromHostname(input.hostname)
  if (byHost) return byHost

  if (input.href && hrefHasGreenhouseJobId(input.href)) return 'greenhouse'
  if (input.document && documentHasGreenhouseMarkers(input.document)) return 'greenhouse'
  if (input.document && documentHasWorkableMarkers(input.document)) return 'workable'

  return null
}
