import type { PersonalInfo } from '../../types/index.ts'

// Portal value saved by ApplicationAccountFormDialog ("iCIMS"). Match is case-insensitive
// so "icims" or " ICIMS " still resolve.
export const ICIMS_ACCOUNT_PORTAL = 'icims'

// ats.ts and jobSitePatterns list every icims.com host for telemetry, including the
// corporate site (www.icims.com) and the recruiter platform (login.icims.com). Candidate
// apply/login lives on a career-portal subdomain such as careers-acme.icims.com.
export function isIcimsCandidateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host !== 'icims.com' && !host.endsWith('.icims.com')) return false
  if (host === 'icims.com' || host === 'www.icims.com' || host === 'login.icims.com') return false
  return true
}

// iCIMS career sites use one host for job search, the job description, and the login
// wall. Only the login / create-account step needs a portal password. A job description
// (`/jobs/{id}/{slug}/job`) or search results must not warn.
const LOGIN_PATH_SEGMENTS = new Set([
  'login',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'register',
  'create-account',
  'createaccount',
  'create_account',
])

const LOGIN_QUERY_VALUES = new Set(['login', 'register', 'signup', 'createaccount', 'create-account'])

export function isIcimsLoginPath(pathname: string, search = ''): boolean {
  const segments = pathname.toLowerCase().split('/').filter(Boolean)
  if (segments.some((segment) => LOGIN_PATH_SEGMENTS.has(segment))) return true

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const mode = (params.get('mode') || '').toLowerCase()
  if (LOGIN_QUERY_VALUES.has(mode)) return true
  const action = (params.get('action') || '').toLowerCase()
  return LOGIN_QUERY_VALUES.has(action)
}

export type IcimsPageSignals = {
  hostname: string
  pathname: string
  search?: string
  hasPasswordField?: boolean
}

// URL login/create-account routes, or a password field on a candidate portal (the login
// widget is sometimes injected onto the job page without a /login navigation).
export function isIcimsLoginSurface(page: IcimsPageSignals): boolean {
  if (!isIcimsCandidateHost(page.hostname)) return false
  if (isIcimsLoginPath(page.pathname, page.search ?? '')) return true
  return page.hasPasswordField === true
}

type PasswordQueryRoot = {
  querySelector?: (selector: string) => unknown
}

export function pageHasPasswordField(doc: PasswordQueryRoot | null | undefined): boolean {
  if (!doc?.querySelector) return false
  try {
    return !!doc.querySelector('input[type="password"]')
  } catch {
    return false
  }
}

const present = (value: string | undefined | null): string => {
  if (value == null) return ''
  return value.trim() === '' ? '' : value
}

// Portal `icims` only. The legacy accountEmail / accountPassword pair is a Workday
// leftover and is not an iCIMS login.
export function getIcimsAccount(personalInfo: Partial<PersonalInfo> | null | undefined): {
  email: string
  password: string
} {
  const icimsAccounts = (personalInfo?.applicationAccounts ?? []).filter(
    (account) => account.portal?.trim().toLowerCase() === ICIMS_ACCOUNT_PORTAL,
  )
  const complete = icimsAccounts.find(
    (account) => present(account.email) && present(account.password),
  )
  const saved = complete ?? icimsAccounts[0]
  return {
    email: present(saved?.email).trim(),
    password: present(saved?.password),
  }
}

export function hasIcimsAccountCredentials(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  const account = getIcimsAccount(personalInfo)
  return account.email.length > 0 && account.password.trim().length > 0
}
