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

// Posting URL without /apply, search, or hash. Other hosts stay as given.
export function canonicalMatchJobUrl(href: string): string {
  const job = workdayJob(href)
  if (!job) return href
  return `${job.origin}${job.postingPath}`
}

// Stable id for in-flight and sent-set dedupe. Non-Workday URLs use the href.
export function matchJobIdentity(href: string): string {
  return workdayJobKey(href) ?? href
}

export function sameMatchJob(left: string, right: string): boolean {
  if (left === right) return true
  const leftKey = workdayJobKey(left)
  const rightKey = workdayJobKey(right)
  return leftKey != null && leftKey === rightKey
}
