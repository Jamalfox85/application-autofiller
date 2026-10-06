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

// Application Accounts stores the portal as "Workday". A row saved against the
// career-site host (cisco.wd5.myworkdayjobs.com, or a generic myworkdayjobs
// label) is the same vault. www.workday.com is not an apply host and is not a
// match. Greenhouse and every other portal stay out.
function isWorkdayAccountPortal(portal: string | undefined | null): boolean {
  const key = (portal || '').trim().toLowerCase()
  if (!key) return false
  if (key === WORKDAY_ACCOUNT_PORTAL) return true
  return key.includes('myworkday')
}

function workdayAccountRows(personalInfo: Partial<PersonalInfo> | null | undefined) {
  return (personalInfo?.applicationAccounts ?? []).filter((account) =>
    isWorkdayAccountPortal(account.portal),
  )
}

function accountIsComplete(account: { email?: string | null; password?: string | null }): boolean {
  return present(account.email).length > 0 && present(account.password).trim().length > 0
}

// Prefers the per-portal entry in applicationAccounts (one login per portal) and falls
// back to the legacy flat fields for profiles saved before that migration. A blank field
// on the Workday row still falls through to the legacy value for that field. A generic
// Workday row wins over a host-specific myworkday row when both are complete.
export function getWorkdayAccount(personalInfo: Partial<PersonalInfo> | null | undefined): {
  email: string
  password: string
} {
  const workdayAccounts = workdayAccountRows(personalInfo)
  const generic = workdayAccounts.filter(
    (account) => account.portal?.trim().toLowerCase() === WORKDAY_ACCOUNT_PORTAL,
  )
  const saved =
    generic.find(accountIsComplete) ??
    workdayAccounts.find(accountIsComplete) ??
    generic[0] ??
    workdayAccounts[0]
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

// The tester notice is about a saved Application Accounts row, not the legacy
// accountEmail / accountPassword pair. Legacy values can still fill the form.
export function hasSavedWorkdayApplicationAccount(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  return workdayAccountRows(personalInfo).some(accountIsComplete)
}
