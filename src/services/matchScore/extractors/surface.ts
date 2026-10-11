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
  if (host === 'jobs.ashbyhq.com' || host.endsWith('.ashbyhq.com')) {
    const script = doc?.querySelector('script[type="application/ld+json"]')
    return (script?.textContent || '').includes('JobPosting')
  }
  return false
}
