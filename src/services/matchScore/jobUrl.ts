// A Workday overview and its apply step are the same requisition. The apply
// path is /apply or /apply/applyManually after the job slug. The requisition id
// is the slug text after the last underscore (JR2020825, 2028178-1).

interface WorkdayJob {
  origin: string
  host: string
  site: string
  req: string
  postingPath: string
}

function workdayJob(href: string): WorkdayJob | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (!host.includes('myworkday')) return null
  const segments = url.pathname.split('/').filter(Boolean)
  const jobAt = segments.findIndex((segment) => segment.toLowerCase() === 'job')
  if (jobAt < 1) return null
  const after = segments.slice(jobAt + 1)
  const applyAt = after.findIndex((segment) => segment.toLowerCase() === 'apply')
  const jobSegments = applyAt === -1 ? after : after.slice(0, applyAt)
  if (jobSegments.length === 0) return null
  const slug = jobSegments[jobSegments.length - 1]
  const split = slug.lastIndexOf('_')
  if (split <= 0 || split === slug.length - 1) return null
  let req = slug.slice(split + 1)
  try {
    req = decodeURIComponent(req)
  } catch {
    // Keep the raw slug when it is not valid encoding.
  }
  if (!req) return null
  return {
    origin: url.origin,
    host,
    site: segments[jobAt - 1],
    req,
    postingPath: `/${segments.slice(0, jobAt + 1).concat(jobSegments).join('/')}`,
  }
}

// host|site|requisition. Null when the URL is not a Workday job.
export function workdayJobKey(href: string): string | null {
  const job = workdayJob(href)
  if (!job) return null
  return `${job.host}|${job.site.toLowerCase()}|${job.req.toLowerCase()}`
}

// Viewport, iframe, and campaign params change when the window resizes or the
// link source changes. They are not part of the job. Identifying params such as
// gh_jid, for, and token stay.
const NOISE_PARAMS = new Set([
  'mobile',
  'width',
  'height',
  'in_iframe',
  'iframe',
  'bga',
  'needsredirect',
  'jan1offset',
  'jun1offset',
  'hashed',
  'gh_src',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_cid',
  'mc_eid',
  'lever-origin',
])

function isNoiseParam(key: string): boolean {
  const name = key.toLowerCase()
  if (NOISE_PARAMS.has(name)) return true
  if (name.startsWith('utm_')) return true
  if (name.startsWith('lever-source')) return true
  return false
}

function stripNoise(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }
  const host = url.hostname.toLowerCase()
  // The job id is the path. Every query param on these portals is window chrome
  // or a session token (mobile, width, height, in_iframe, hashed).
  if (host === 'icims.com' || host.endsWith('.icims.com')) {
    if (!url.search && !url.hash) return href
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  let dropped = false
  for (const key of [...url.searchParams.keys()]) {
    if (!isNoiseParam(key)) continue
    url.searchParams.delete(key)
    dropped = true
  }
  if (!dropped) return href
  return url.toString()
}

// Posting URL without the apply step, window-size params, or tracking params.
export function canonicalMatchJobUrl(href: string): string {
  const job = workdayJob(href)
  if (job) return `${job.origin}${job.postingPath}`
  return stripNoise(href)
}

// Stable id for in-flight and sent-set dedupe.
export function matchJobIdentity(href: string): string {
  return workdayJobKey(href) ?? canonicalMatchJobUrl(href)
}

export function sameMatchJob(left: string, right: string): boolean {
  if (left === right) return true
  return matchJobIdentity(left) === matchJobIdentity(right)
}
