import type { PersonalInfo } from '../../types/index.ts'
import { accountIdPasswordLocked } from '../../lib/accountPasswordFill.ts'
import {
  savedAccountRequiresConfirmation,
  savedPasswordAwaitingConfirmation,
} from '../../lib/savedAccountConfirmation.ts'

// Portal value saved by ApplicationAccountFormDialog ("iCIMS"). Match is case-insensitive
// so "icims" or " ICIMS " still resolve.
export const ICIMS_ACCOUNT_PORTAL = 'icims'

// ats.ts and jobSitePatterns list every icims.com host for telemetry, including the
// corporate site (www.icims.com). Career-portal apply/login lives on a subdomain such
// as careers-acme.icims.com. login.icims.com is Auth0 Universal Login for those
// career sign-in links (identifier, then password). It is not a candidate application
// host: there is no profile form there, only the saved account.
export function isIcimsCandidateHost(hostname: string): boolean {
  const host = normalizeIcimsHost(hostname)
  if (host !== 'icims.com' && !host.endsWith('.icims.com')) return false
  if (host === 'icims.com' || host === 'www.icims.com' || host === 'login.icims.com') return false
  return true
}

function normalizeIcimsHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

// Careers sign-in (for example us-erac.icims.com/jobs/login?loginOnly=1) sends the
// browser to login.icims.com/authorize, which lands on /u/login/identifier and then
// /u/login/password. Those two documents are in scope. /authorize itself has no form.
export function isIcimsAuth0LoginHost(hostname: string): boolean {
  return normalizeIcimsHost(hostname) === 'login.icims.com'
}

export function isIcimsAuth0LoginPath(pathname: string): boolean {
  const path = pathname.toLowerCase()
  return path === '/u/login' || path.startsWith('/u/login/')
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
  if (isIcimsAuth0LoginHost(page.hostname) && isIcimsAuth0LoginPath(page.pathname)) return true
  if (!isIcimsCandidateHost(page.hostname)) return false
  if (page.hasEmailGate === true || page.hasPasswordField === true) return true
  return isIcimsLoginPath(page.pathname, page.search ?? '')
}

// Joby Aviation and HireRight (2026-10-04) both stop on "Enter Your Information":
// an email field, no password, and Next opens hCaptcha. The password step is a
// later document state (a password input exists). GoFillr writes this step once
// so captcha DOM changes do not type into the form again. A combined login that
// already shows a password is not this step.
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

type PasswordLike = {
  hidden?: boolean
  type?: string
  getAttribute?: (name: string) => string | null
}

function passwordInputType(element: PasswordLike): string {
  try {
    return (element.getAttribute?.('type') || element.type || '').toLowerCase()
  } catch {
    return (element.type || '').toLowerCase()
  }
}

type PasswordQueryRoot = {
  querySelector?: (selector: string) => unknown
  querySelectorAll?: (selector: string) => ArrayLike<PasswordLike>
}

// Auth0's identifier step keeps a decoy `input[type=password]` in the DOM
// (`hidden`, `aria-hidden`, tabindex -1, autocomplete off). It is not a password
// field. The real password step is a later document with a visible password input.
export function isConcealedPasswordInput(element: PasswordLike | null | undefined): boolean {
  if (!element) return true
  if (element.hidden === true) return true
  try {
    if (element.getAttribute?.('hidden') != null) return true
    if ((element.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true') return true
  } catch {
    return false
  }
  return false
}

export function pageHasPasswordField(doc: PasswordQueryRoot | null | undefined): boolean {
  if (!doc) return false
  if (typeof doc.querySelectorAll === 'function') {
    try {
      const nodes = doc.querySelectorAll('input[type="password"]')
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node) continue
        const type = passwordInputType(node)
        if (type && type !== 'password') continue
        if (!isConcealedPasswordInput(node)) return true
      }
      return false
    } catch {
      return false
    }
  }
  if (!doc.querySelector) return false
  try {
    const found = doc.querySelector('input[type="password"]')
    if (!found || typeof found !== 'object') return !!found
    return !isConcealedPasswordInput(found as PasswordLike)
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

// The account editor labels this "Ask before entering this password".
// The decision lives in savedAccountConfirmation so Workday uses the same check.
export function icimsAccountRequiresConfirmation(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  return savedAccountRequiresConfirmation(resolveIcimsAccount(personalInfo))
}

// True when the iCIMS row's password must stay blank until the user confirms.
export function icimsPasswordAwaitingConfirmation(
  personalInfo: Partial<PersonalInfo> | null | undefined,
  options?: { confirmed?: boolean },
): boolean {
  return savedPasswordAwaitingConfirmation(resolveIcimsAccount(personalInfo), options)
}

// The iCIMS row's password was sealed and did not open. Legacy accountPassword
// is not an iCIMS login, so a locked Workday password does not trip this.
export function icimsSavedPasswordLocked(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  if (present(getIcimsAccount(personalInfo).password).trim()) return false
  const icimsAccounts = (personalInfo?.applicationAccounts ?? []).filter(
    (account) => account.portal?.trim().toLowerCase() === ICIMS_ACCOUNT_PORTAL,
  )
  return icimsAccounts.some((account) => accountIdPasswordLocked(personalInfo, account.id))
}

export function hasIcimsAccountCredentials(
  personalInfo: Partial<PersonalInfo> | null | undefined,
): boolean {
  const account = getIcimsAccount(personalInfo)
  return account.email.length > 0 && account.password.trim().length > 0
}

// Enterprise Mobility and HireRight candidate profiles reject a password with
// "Your password must have at least: 1 uppercase". No other iCIMS password rule
// is recorded in this repo or on that form.
const ICIMS_PASSWORD_UPPERCASE = /[A-Z]/

// A password that already has an uppercase letter is returned unchanged.
// A password that does not is rewritten so it has one: the first a-z letter is
// capitalized, or a single uppercase letter is appended when the password has
// no letter. A blank password stays blank.
export function icimsAccountPassword(password: string): string {
  if (password.trim() === '' || ICIMS_PASSWORD_UPPERCASE.test(password)) return password
  const capitalized = password.replace(/[a-z]/, (letter) => letter.toUpperCase())
  if (ICIMS_PASSWORD_UPPERCASE.test(capitalized)) return capitalized
  return `${password}A`
}

// Workday, Greenhouse, and every other portal keep the password that was typed.
export function passwordForApplicationAccount(portal: string, password: string): string {
  if (portal.trim().toLowerCase() !== ICIMS_ACCOUNT_PORTAL) return password
  return icimsAccountPassword(password)
}
