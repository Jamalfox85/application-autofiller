// The autofill toast used to fire on any job-platform host. A Greenhouse board
// index (https://job-boards.greenhouse.io/anthropic) is that host and has search
// filters, but no application form. Offer the fill only when this document has
// a fillable application form, or when the URL is a known apply shape and the
// form shows up after a short retry. Board, listing, and index URLs stay quiet.
//
// job-boards.greenhouse.io/…/jobs/{id} already has form#application-form in the
// server HTML (including react-select comboboxes). Remix then hydrateRoot(document)
// drops the prompt node; applicationPrompt puts that node back.
//
// Before #121, detectJobApplicationPage toasted every careers-*.icims.com URL in
// every frame (cdd3ffd). The job description (/jobs/{id} and /jobs/{id}/{slug}/job),
// the /login email gate, the password step on that same URL, and /candidate were
// all in that set. Search and the jobs index stay quiet. The outer document's
// prompt is position:fixed above the content iframe, which is the toast that
// stays on screen. The ?in_iframe=1 frame does not offer a second one
// (HealthEdge /login used to stack two). A frame opened on its own still offers.

import { hrefHasGreenhouseJobId, isWorkableApplyHost } from '../utils/ats.ts'
import { FIELD_POLL_MS, FIELD_WAIT_MS } from '../utils/detectionRetry.ts'
import { applicationUrlPatterns, excludePatterns, jobPlatforms } from '../utils/jobSitePatterns.ts'
import { isIcimsCandidateHost, isIcimsLoginPath } from '../utils/siteRules/icimsAccount.ts'

/** Enough controls to look like an application rather than a search box. */
export const MIN_APPLICATION_FIELDS = 4

const FILLABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
].join(', ')

// Markers used by the supported ATS apply forms. A marker plus at least one
// control counts even when the first step is shorter than MIN_APPLICATION_FIELDS.
const FORM_MARKER_SELECTOR = [
  '#application-form',
  '#application_form',
  'form.application--form',
  'form.application-form',
  '.application-form',
  '.ashby-application-form-container',
  '.ashby-survey-form-container',
  '.jv-apply-form',
  '[data-ui="application-form"]',
  '[data-ui="eeoc-form"]',
  '[data-automation-id="applyFlowPage"]',
  '[data-automation-id="applyFlowMyInfoPage"]',
  '[data-automation-id="applyFlowMyExpPage"]',
  '.iCIMS_ResumeSection',
  '.iCIMS_ProfileForm',
  // "Enter Your Information" on careers-*.icims.com/jobs/{id}/…/login.
  '#enterEmailForm',
  'form.iCIMS_SignIn',
  '.iCIMS_LoginPage',
  'form#applicationForm',
  'form.BambooHR-ATS',
  '#career-application',
].join(', ')

export type ApplicationDetectionMethod = 'form' | 'url_pattern' | 'dom_detection'

export type ApplicationPageDetection = {
  detected: boolean
  /** Known apply URL whose form is not in the document yet. Caller should retry. */
  pending: boolean
  method: ApplicationDetectionMethod | null
  fieldCount: number
}

export type ApplicationPageInput = {
  href: string
  document: Document
}

function none(fieldCount: number): ApplicationPageDetection {
  return { detected: false, pending: false, method: null, fieldCount }
}

function pending(fieldCount: number): ApplicationPageDetection {
  return { detected: false, pending: true, method: null, fieldCount }
}

function found(fieldCount: number, method: ApplicationDetectionMethod): ApplicationPageDetection {
  return { detected: true, pending: false, method, fieldCount }
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href)
  } catch {
    return null
  }
}

function segments(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part).toLowerCase()
      } catch {
        return part.toLowerCase()
      }
    })
}

function hostEnds(hostname: string, suffix: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === suffix || host.endsWith(`.${suffix}`)
}

export function countFillableFields(doc: Document): number {
  return doc.querySelectorAll(FILLABLE_SELECTOR).length
}

export function hasApplicationFormMarkers(doc: Document): boolean {
  return !!doc.querySelector(FORM_MARKER_SELECTOR)
}

function isExcludedUrl(href: string): boolean {
  const url = href.toLowerCase()
  return excludePatterns.some((pattern) => url.includes(pattern))
}

function isJobPlatformUrl(href: string): boolean {
  const url = href.toLowerCase()
  return jobPlatforms.some((platform) => url.includes(platform))
}

function hasGenericApplicationUrl(href: string): boolean {
  const url = href.toLowerCase()
  return applicationUrlPatterns.some((pattern) => url.includes(pattern))
}

function isGreenhouseHost(hostname: string): boolean {
  return hostEnds(hostname, 'greenhouse.io')
}

function isAshbyHost(hostname: string): boolean {
  return hostEnds(hostname, 'ashbyhq.com')
}

function isLeverHost(hostname: string): boolean {
  return hostEnds(hostname, 'lever.co')
}

function isJobviteHost(hostname: string): boolean {
  return hostEnds(hostname, 'jobvite.com')
}

function isIcimsHost(hostname: string): boolean {
  return hostname.toLowerCase().includes('icims.com')
}

function isBambooHost(hostname: string): boolean {
  return hostEnds(hostname, 'bamboohr.com')
}

// Pre-#121 treated the whole career host as an application. These are the pages
// that toast was on: the posting (/jobs/555885 and /jobs/{id}/{slug}/job), the
// email gate and password step (/login, /create-account), and the profile
// (/candidate, /form). Search and the jobs index are not.
export function isIcimsApplySurface(url: URL): boolean {
  if (!isIcimsCandidateHost(url.hostname)) return false
  const parts = segments(url)
  if (parts.includes('search') || parts.includes('intro')) return false
  if (parts.length === 0) return false
  if (parts.length === 1 && parts[0] === 'jobs') return false
  if (parts[parts.length - 1] === 'jobs' && !parts.some((part) => /^\d+$/.test(part))) return false
  if (isIcimsLoginPath(url.pathname, url.search)) return true
  if (parts.some((part) => part === 'candidate' || part === 'apply' || part === 'form')) return true
  const mode = (url.searchParams.get('mode') || '').toLowerCase()
  const apply = (url.searchParams.get('apply') || '').toLowerCase()
  if (mode === 'apply' || apply === 'yes' || apply === '1' || apply === 'true') return true
  const jobsAt = parts.indexOf('jobs')
  if (jobsAt < 0) return false
  return parts.slice(jobsAt + 1).some((part) => /^\d+$/.test(part))
}

export function isIcimsInFrameUrl(href: string): boolean {
  const url = parseUrl(href)
  if (!url) return /[?&]in_iframe=1(?:&|$)/.test(href)
  return url.searchParams.get('in_iframe') === '1'
}

// iCIMS job and login documents often have no local fields: the shell's inputs
// live in icims_content_iframe, and HealthEdge's login gate is one email plus
// a checkbox. Workday /apply and BambooHR /careers/{id} could not be snapshotted
// as a filled form, so a known apply URL prompts instead of staying quiet.
function promptOnUrlWithoutFields(href: string): boolean {
  const url = parseUrl(href)
  if (!url) return false
  if (isIcimsApplySurface(url)) return true
  if (isMyWorkdayHost(url.hostname) && /\/apply(?:\/|$)/.test(url.pathname.toLowerCase())) return true
  if (isBambooHost(url.hostname) && segments(url).some((part) => /^\d+$/.test(part))) return true
  return false
}

// The content iframe (?in_iframe=1) and the career-portal shell are the same
// page, and both used to toast. Only the top document offers the fill, so
// HealthEdge /login does not stack two prompts. The top prompt is position:fixed
// on the window, above the iframe. A frame opened on its own
// (window.top === window) still offers.
export function shouldOfferAutofillToast(
  href: string,
  detection: ApplicationPageDetection,
  inEmbeddedFrame = false,
): boolean {
  if (!detection.detected) return false
  if (inEmbeddedFrame && isIcimsInFrameUrl(href)) return false
  return true
}

function isMyWorkdayHost(hostname: string): boolean {
  return hostname.toLowerCase().includes('myworkday')
}

function isCorporateWorkdayHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host.includes('workday.com') && !host.includes('myworkday')
}

/** Board, listing, and index URLs. These never get the autofill toast. */
export function isListingOrBoardUrl(href: string): boolean {
  const url = parseUrl(href)
  if (!url) return false
  if (isExcludedUrl(href)) return true

  const host = url.hostname
  const parts = segments(url)
  const path = url.pathname.toLowerCase()

  if (isGreenhouseHost(host)) {
    if (path.includes('/embed/job_app')) return false
    if (/\/jobs\/\d+(?:\/|$)/.test(path)) return false
    return true
  }

  if (isAshbyHost(host)) return parts.length <= 1

  if (isLeverHost(host)) return parts.length <= 1

  if (isJobviteHost(host)) {
    if (host.toLowerCase().startsWith('app.')) return true
    if (parts.length <= 1) return true
    if (parts.includes('search')) return true
    if (parts[parts.length - 1] === 'jobs' && !parts.includes('job')) return true
    return false
  }

  if (isWorkableApplyHost(host)) {
    if (parts.length <= 1) return true
    if (parts.length === 2 && (parts[1] === 'jobs' || parts[1] === 'j')) return true
    return false
  }

  if (isCorporateWorkdayHost(host)) return true

  if (isMyWorkdayHost(host)) {
    if (path.includes('/job/') || /\/apply(?:\/|$)/.test(path)) return false
    return true
  }

  if (isIcimsHost(host)) {
    if (!isIcimsCandidateHost(host)) return true
    if (parts.length === 0) return true
    if (parts.includes('search') || parts.includes('intro')) return true
    if (parts.length === 1 && parts[0] === 'jobs') return true
    if (parts[parts.length - 1] === 'jobs') return true
    // A job id, /login, and /candidate are the apply entry, not a board index.
    if (isIcimsApplySurface(url)) return false
    return true
  }

  if (isBambooHost(host)) {
    const onCareers = parts.includes('careers') || parts.includes('jobs')
    if (!onCareers) return true
    if (parts.length === 1) return true
    if (parts.includes('list') && !parts.some((part) => /^\d+$/.test(part))) return true
    return false
  }

  if (isJobPlatformUrl(href)) {
    if (parts.length <= 1) return true
    const last = parts[parts.length - 1]
    if (last === 'search' || last === 'jobs' || last === 'careers' || last === 'openings') return true
  }

  return false
}

/** Apply URL shapes for the supported ATS. The form may still be mounting. */
export function isKnownApplicationUrl(href: string): boolean {
  const url = parseUrl(href)
  if (!url || isListingOrBoardUrl(href)) return false

  const host = url.hostname
  const parts = segments(url)
  const path = url.pathname.toLowerCase()

  if (isGreenhouseHost(host)) return true
  if (hrefHasGreenhouseJobId(href)) return true
  if (isAshbyHost(host)) return parts.length >= 2
  if (isLeverHost(host)) return parts.length >= 2
  if (isJobviteHost(host)) return parts.includes('apply') || parts.includes('job')
  if (isWorkableApplyHost(host)) return parts.includes('apply') || parts.includes('j')
  if (isMyWorkdayHost(host)) return path.includes('/job/') || /\/apply(?:\/|$)/.test(path)
  if (isIcimsHost(host)) return isIcimsApplySurface(url)
  if (isBambooHost(host)) return parts.some((part) => /^\d+$/.test(part))
  return false
}

// A Greenhouse (or Workable) apply iframe. The fill runs in that frame, so the
// parent document must not toast — clicking the parent prompt cannot reach the
// cross-origin form. #whr_embed_hook and embed/job_board are job lists.
function hasEmbeddedApplicationFrame(doc: Document): boolean {
  const frames = doc.querySelectorAll('iframe[src]')
  for (const frame of frames) {
    const src = frame.getAttribute('src') || ''
    if (/greenhouse/i.test(src) && (/job_app/i.test(src) || /\/jobs\/\d+/.test(src))) return true
    if (/\/embed\/job_app/i.test(src)) return true
    if (/apply\.workable\.com/i.test(src) && /(\/apply|\/j\/)/i.test(src)) return true
  }
  return false
}

function fieldsQualify(href: string, fields: number): boolean {
  if (fields < MIN_APPLICATION_FIELDS) return false
  const url = parseUrl(href)
  if (!url) return false
  // A Workday job posting carries header chrome. The application is /apply,
  // or an apply-flow marker handled separately.
  if (isMyWorkdayHost(url.hostname) && !/\/apply(?:\/|$)/.test(url.pathname.toLowerCase())) return false
  if (isKnownApplicationUrl(href)) return true
  return isJobPlatformUrl(href)
}

export function detectApplicationPage(input: ApplicationPageInput): ApplicationPageDetection {
  const href = input.href || ''
  const doc = input.document
  const fields = countFillableFields(doc)
  const url = parseUrl(href)

  if (!url || isExcludedUrl(href) || isListingOrBoardUrl(href)) return none(fields)

  const markers = hasApplicationFormMarkers(doc)
  // Child frame owns the form. Don't wait out a pending poll on the shell.
  if (hasEmbeddedApplicationFrame(doc) && !markers) return none(fields)

  // URL shapes that are the apply step even when this document has no inputs yet
  // (iCIMS shell, Workday /apply before the flow mounts, BambooHR job id).
  if (promptOnUrlWithoutFields(href)) return found(fields, 'url_pattern')

  if (markers && fields >= 1) return found(fields, 'form')

  if (fieldsQualify(href, fields)) {
    return found(fields, isKnownApplicationUrl(href) ? 'url_pattern' : 'dom_detection')
  }

  if (!isJobPlatformUrl(href) && !hrefHasGreenhouseJobId(href) && hasGenericApplicationUrl(href)) {
    if (doc.querySelector('form') && fields >= MIN_APPLICATION_FIELDS) return found(fields, 'dom_detection')
  }

  // Form shell, or a known apply URL whose controls have not mounted yet.
  // A Workday /job/ posting and a Jobvite /job/ page are not the apply step; waiting
  // there only delays "no form". A form that mounts later is still picked up by the
  // content script's DOM watch, and /apply still retries.
  if (shouldWaitForForm(href, markers, fields)) return pending(fields)

  return none(fields)
}

function shouldWaitForForm(href: string, markers: boolean, fields: number): boolean {
  if (markers && fields === 0) return true
  if (!isKnownApplicationUrl(href)) return false
  const url = parseUrl(href)
  if (!url) return false
  if (isMyWorkdayHost(url.hostname) && !/\/apply(?:\/|$)/.test(url.pathname.toLowerCase())) return false
  if (isJobviteHost(url.hostname) && !segments(url).includes('apply')) return false
  return true
}

export async function detectApplicationPageWhenReady(
  read: () => ApplicationPageDetection,
  wait: (ms: number) => Promise<void>,
  options: { timeoutMs?: number; stepMs?: number } = {},
): Promise<ApplicationPageDetection> {
  const timeoutMs = options.timeoutMs ?? FIELD_WAIT_MS
  const stepMs = options.stepMs ?? FIELD_POLL_MS
  let current = read()
  if (current.detected || !current.pending) return current
  for (let waited = 0; current.pending && !current.detected && waited < timeoutMs; waited += stepMs) {
    await wait(stepMs)
    current = read()
  }
  if (!current.detected) return { ...current, pending: false }
  return current
}
