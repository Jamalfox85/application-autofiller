export const jobPlatforms = [
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'myworkdayjobs.com',
  'icims.com',
  'taleo',
  'smartrecruiters.com',
  'bamboohr.com',
  'ashbyhq.com',
  'jobvite.com',
  'ultipro.com',
  'breezy.hr',
  'recruitee.com',
  'jazz.co',
  'applytojob.com',
  'dayforcehcm',
]

export const excludePatterns = [
  'indeed.com/jobs?', // Indeed search results
  'indeed.com/m/?', // Indeed mobile home
  'linkedin.com/jobs/search', // LinkedIn job search
  'linkedin.com/jobs/collections', // LinkedIn saved jobs
  'linkedin.com/feed', // LinkedIn feed
  '/jobs/search?', // Generic job search
  '/careers/search?', // Career page search
]

export const applicationUrlPatterns = [
  '/apply',
  '/application',
  '/job/',
  '/jobs/',
  '/posting/',
  '/position/',
  '/career/',
  '/careers/',
  '/opportunity/',
]

// Human-readable ATS name for a matched jobPlatforms entry, e.g. "greenhouse.io" -> "Greenhouse".
export function getSiteLabel(hostname: string): string {
  const lower = hostname.toLowerCase()
  const matched = jobPlatforms.find((platform) => lower.includes(platform))
  if (!matched) return hostname

  const name = matched.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
}
