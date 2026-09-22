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

export function atsFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase()
  for (const rule of ATS_HOST_RULES) {
    if (host.includes(rule.fragment)) return rule.ats
  }
  return null
}
