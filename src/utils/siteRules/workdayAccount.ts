import type { PersonalInfo } from '../../types/index.ts'

// Portal value saved by ApplicationAccountFormDialog. Match is case-insensitive so older
// rows stored as "workday" or "WORKDAY" still resolve.
export const WORKDAY_ACCOUNT_PORTAL = 'workday'

// Candidate career sites use a myworkday host: myworkdayjobs.com, myworkday.com, and
// myworkdaysite.com. ats.ts and jobSitePatterns also list workday.com, which tags the
// corporate site (www.workday.com) for telemetry. That host is not an apply flow, so
// account creation stays on myworkday and does not run there.
export function isWorkdayApplyHost(hostname: string): boolean {
  return hostname.toLowerCase().includes('myworkday')
}

const present = (value: string | undefined | null): string => {
  if (value == null) return ''
  return value.trim() === '' ? '' : value
}

// Prefers the per-portal entry in applicationAccounts (one login per portal) and falls
// back to the legacy flat fields for profiles saved before that migration. A blank field
// on the Workday row still falls through to the legacy value for that field.
export function getWorkdayAccount(personalInfo: Partial<PersonalInfo> | null | undefined): {
  email: string
  password: string
} {
  const workdayAccounts = (personalInfo?.applicationAccounts ?? []).filter(
    (account) => account.portal?.trim().toLowerCase() === WORKDAY_ACCOUNT_PORTAL,
  )
  const complete = workdayAccounts.find(
    (account) => present(account.email) && present(account.password),
  )
  const saved = complete ?? workdayAccounts[0]
  const email = present(saved?.email).trim() || present(personalInfo?.accountEmail).trim()
  const password = present(saved?.password) || present(personalInfo?.accountPassword)
  return { email, password }
}

export function hasWorkdayAccountCredentials(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  const account = getWorkdayAccount(personalInfo)
  return account.email.length > 0 && account.password.trim().length > 0
}
