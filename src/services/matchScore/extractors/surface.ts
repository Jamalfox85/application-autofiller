import { ICIMS_DESCRIPTION_SELECTOR } from './icims.ts'

// A form is the usual score surface. These description nodes are enough on their
// own: the iCIMS job frame, an overview that has no form, and an apply page whose
// fields are not inside a form element.
const SCORE_SURFACE_SELECTOR = [
  'form',
  '#application-form',
  '#application_form',
  ICIMS_DESCRIPTION_SELECTOR,
  '.ashby-job-posting-description',
  '[data-ui="job-description"]',
  '[data-qa="job-description"]',
  '.jv-job-detail-description',
  '[data-automation-id="jobPostingDescription"]',
].join(', ')

type SurfaceDocument = {
  querySelector(selector: string): { textContent?: string | null } | null
}

function hostname(href: string | undefined): string {
  if (!href) return ''
  try {
    return new URL(href).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function matchScoreSurfaceReady(doc: SurfaceDocument | null | undefined, href?: string): boolean {
  if (doc?.querySelector(SCORE_SURFACE_SELECTOR)) return true
  const host = hostname(href)
  // Apply pages ship the posting in JSON-LD and render inputs without a form.
  // The same script on an overview is enough to score before the description paints.
  if (host === 'jobs.ashbyhq.com' || host.endsWith('.ashbyhq.com')) return jsonLdJobPosting(doc)
  // The job page hydrates the description after the JSON-LD script. Waiting for
  // that node keeps the line breaks. The apply step never adds the node.
  if (host.includes('myworkday') && isWorkdayApply(href)) return jsonLdJobPosting(doc)
  return false
}

function jsonLdJobPosting(doc: SurfaceDocument | null | undefined): boolean {
  const script = doc?.querySelector('script[type="application/ld+json"]')
  return (script?.textContent || '').includes('JobPosting')
}

function isWorkdayApply(href: string | undefined): boolean {
  if (!href) return false
  try {
    return /\/apply(?:\/|$)/.test(new URL(href).pathname.toLowerCase())
  } catch {
    return false
  }
}
