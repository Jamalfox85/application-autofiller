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
  /** Email-first apply gate ("Enter Your Information" + an email field). No password yet. */
  hasEmailGate?: boolean
  hasPasswordField?: boolean
}

// Candidate host plus any of:
// - `/jobs/{id}/…/login` (including when that document is the iframe, `?in_iframe=1`)
// - the email-first gate ("Enter Your Information" / Email + Next), even with no password
// - a password field
// Application fields sit behind this gate, so they are not part of the check.
export function isIcimsLoginSurface(page: IcimsPageSignals): boolean {
  if (!isIcimsCandidateHost(page.hostname)) return false
  if (page.hasEmailGate === true || page.hasPasswordField === true) return true
  return isIcimsLoginPath(page.pathname, page.search ?? '')
}

// Joby Aviation and HireRight (2026-10-04) both stop on "Enter Your Information":
// an email field, no password, and Next opens hCaptcha. The password step is a
// later document state (a password input exists). That email step is the
// account-creation handoff. A combined login that already shows a password is not.
export function isIcimsAccountCreationEmailStep(page: IcimsPageSignals): boolean {
  if (page.hasPasswordField === true) return false
  if (page.hasEmailGate !== true) return false
  return isIcimsCandidateHost(page.hostname)
}

type GateElement = {
  textContent?: string | null
  getAttribute?: (name: string) => string | null
}

type GateDocument = {
  querySelector?: (selector: string) => unknown
  querySelectorAll?: (selector: string) => ArrayLike<GateElement>
}

const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'password',
  'checkbox',
  'radio',
  'submit',
  'button',
  'file',
  'image',
])

// IC-1/2/3: after Apply, the first screen is "Enter Your Information" with Email + Next.
// IC-2/IC-3 also show an EU/UK resident checkbox and hCaptcha. Those extras are not
// required — the heading plus an email field is the gate, before any application fields.
export function pageHasEmailGate(doc: GateDocument | null | undefined): boolean {
  if (!doc?.querySelectorAll) return false
  const nodes = doc.querySelectorAll('h1, h2, h3, h4, legend, [role="heading"]')
  let heading = false
  for (let i = 0; i < nodes.length; i++) {
    const text = (nodes[i]?.textContent || '').replace(/\s+/g, ' ').trim()
    if (text.length === 0 || text.length > 160) continue
    if (/enter your information/i.test(text)) {
      heading = true
      break
    }
  }
  if (!heading) return false

  const inputs = doc.querySelectorAll('input')
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    if (!input?.getAttribute) continue
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    if (SKIP_INPUT_TYPES.has(type)) continue
    const hint = [
      type,
      input.getAttribute('name'),
      input.getAttribute('id'),
      input.getAttribute('placeholder'),
      input.getAttribute('aria-label'),
      input.getAttribute('autocomplete'),
    ]
      .join(' ')
      .toLowerCase()
    if (type === 'email' || hint.includes('email')) return true
  }
  return false
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

function resolveIcimsAccount(personalInfo: Partial<PersonalInfo> | null | undefined) {
  const icimsAccounts = (personalInfo?.applicationAccounts ?? []).filter(
    (account) => account.portal?.trim().toLowerCase() === ICIMS_ACCOUNT_PORTAL,
  )
  const complete = icimsAccounts.find(
    (account) => present(account.email) && present(account.password),
  )
  return complete ?? icimsAccounts[0]
}

// Portal `icims` only. The legacy accountEmail / accountPassword pair is a Workday
// leftover and is not an iCIMS login.
export function getIcimsAccount(personalInfo: Partial<PersonalInfo> | null | undefined): {
  email: string
  password: string
} {
  const saved = resolveIcimsAccount(personalInfo)
  return {
    email: present(saved?.email).trim(),
    password: present(saved?.password),
  }
}

// The account editor labels this "Ask before entering this password". Workday account
// creation never reads the flag and writes the password as soon as the field exists.
// iCIMS gate fill follows that: a complete row still types the password.
export function icimsAccountRequiresConfirmation(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  return resolveIcimsAccount(personalInfo)?.requireConfirmation === true
}

export function hasIcimsAccountCredentials(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  const account = getIcimsAccount(personalInfo)
  return account.email.length > 0 && account.password.trim().length > 0
}
