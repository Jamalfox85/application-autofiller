import type { PersonalInfo, SiteRule } from '../../types/index.ts'
import { noteSkippedAccountPassword } from '../../lib/accountPasswordFill.ts'
import { requestSavedPasswordConfirmation } from '../../lib/savedAccountConfirmation.ts'
import {
  hasIcimsAccountCredentials,
  icimsSavedPasswordLocked,
  isIcimsAccountCreationEmailStep,
  isIcimsCandidateHost,
  isIcimsLoginSurface,
  pageHasEmailGate,
  pageHasPasswordField,
  type IcimsPageSignals,
} from './icimsAccount.ts'
import {
  publishMissingIcimsAccountNotice,
  readPersonalInfoForIcims,
} from './icimsAccountNotice.ts'
import {
  applyIcimsPlan,
  consumeIcimsHcaptchaStop,
  controlFromElement,
  fillIcimsLocationMenus,
  fillIcimsLoginGate,
  icimsFormSignature,
  icimsLocationMenuCommitted,
  planIcimsFill,
} from './icimsFields.ts'
import { attachIcimsResumeOnce } from './icimsResumeFile.ts'

function icimsFieldRowText(element: {
  closest?: (selector: string) => { textContent?: string | null } | null
  parentElement?: { textContent?: string | null } | null
}): string {
  try {
    const row =
      element.closest?.('.iCIMS_TableRow, .iCIMS_FieldRow, tr, li') || element.parentElement || null
    return (row?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  } catch {
    return ''
  }
}

function readIcimsPage(): IcimsPageSignals {
  const location = typeof window === 'undefined' ? undefined : window.location
  const root = typeof document === 'undefined' ? undefined : document
  const page: IcimsPageSignals = {
    hostname: location?.hostname || '',
    pathname: location?.pathname || '',
    search: location?.search || '',
    hasPasswordField: pageHasPasswordField(root),
  }
  // The email step and the password step share `/login`. Scan for
  // "Enter Your Information" whenever this document has no password yet.
  if (!page.hasPasswordField) {
    page.hasEmailGate = pageHasEmailGate(root)
  }
  return page
}

// What to do on one pass over the login document.
// warnIfMissing: the Application Accounts notice, only when no iCIMS login is saved.
// writeGate describes a login document that has credentials to type. The on-load
// watcher does not type them. Auto-fill, the shortcut, or the password
// confirmation does. The person solves hCaptcha. Nothing here tells them to
// create an account.
export function planIcimsLoginPass(
  page: IcimsPageSignals,
  emailStepAlreadyWritten: boolean,
): { warnIfMissing: boolean; writeGate: boolean } {
  const login = isIcimsCandidateHost(page.hostname) && isIcimsLoginSurface(page)
  const emailStep = isIcimsAccountCreationEmailStep(page)
  return {
    warnIfMissing: login,
    writeGate: login && (!emailStep || !emailStepAlreadyWritten),
  }
}

// Login/create-account and the email-first apply gate. Job search and the job
// description share the career-portal host and must stay quiet. Application fields
// are not reachable until the candidate continues past this gate.
export async function maybeWarnMissingIcimsAccount(
  personalInfo: PersonalInfo | null | undefined,
  page: IcimsPageSignals,
): Promise<boolean> {
  if (!isIcimsLoginSurface(page)) return false
  const latest = await readPersonalInfoForIcims(personalInfo)
  if (hasIcimsAccountCredentials(latest)) return false
  return publishMissingIcimsAccountNotice()
}

let lastFormSignature = ''

function syncIcimsLogin(personalInfo: PersonalInfo | null | undefined) {
  const page = readIcimsPage()
  if (!isIcimsCandidateHost(page.hostname)) return
  const plan = planIcimsLoginPass(page, false)
  if (!isIcimsLoginSurface(page)) return
  void (async () => {
    const latest = await readPersonalInfoForIcims(personalInfo)
    if (icimsSavedPasswordLocked(latest)) {
      noteSkippedAccountPassword()
      return
    }
    if (!hasIcimsAccountCredentials(latest)) {
      if (plan.warnIfMissing) await maybeWarnMissingIcimsAccount(latest, page)
    }
    // Saved email and password are typed only after Auto-fill, the shortcut,
    // or the password confirmation. This watcher must not write them.
    consumeIcimsHcaptchaStop(document)
  })()
}

function watchIcimsLogin(personalInfo: PersonalInfo | null | undefined) {
  if (typeof MutationObserver === 'undefined') return
  const root = document.documentElement ?? document.body
  if (!root) return

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => syncIcimsLogin(personalInfo), 200)
  }
  const observer = new MutationObserver(() => schedule())
  observer.observe(root, { childList: true, subtree: true })

  const onStoredProfile = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes.personalInfo) return
    syncIcimsLogin(changes.personalInfo.newValue as PersonalInfo | undefined)
  }
  let removeProfileListener = () => {}
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(onStoredProfile)
    removeProfileListener = () => chrome.storage.onChanged.removeListener(onStoredProfile)
  }

  return () => {
    if (timer) clearTimeout(timer)
    observer.disconnect()
    removeProfileListener()
  }
}

export default function icimsConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('icims.com'),
    onMount: (personalInfo) => {
      const page = readIcimsPage()
      // Auth0 identifier and password steps fill only after Auto-fill or the
      // shortcut. Loading login.icims.com must not type the account or submit.
      if (!isIcimsCandidateHost(page.hostname)) return
      // Job search and the job description share the career-portal host. The gate
      // watcher stays quiet there and does not type the saved email or password
      // on load. Auto-fill and the shortcut do. A missing login still warns.
      // No popup asks the person to create an account.
      syncIcimsLogin(personalInfo)
      return watchIcimsLogin(personalInfo)
    },
    apply: async (input, fieldText, personalInfo) => {
      const page = readIcimsPage()
      const control = controlFromElement(input, fieldText)
      const contextText = icimsFieldRowText(input)
      if (contextText) control.contextText = contextText
      // Auth0 on login.icims.com is a login surface and is not a career-portal host.
      // Gating this on the candidate host made the identifier field a profile email.
      const plan = planIcimsFill(control, personalInfo, {
        loginSurface: isIcimsLoginSurface(page),
      })
      if (plan.action === 'leave' && plan.reason === 'resume-autofill') return 'skip'
      if (
        plan.action === 'leave' &&
        plan.field === 'gatePassword' &&
        icimsSavedPasswordLocked(personalInfo)
      ) {
        noteSkippedAccountPassword()
        return 'skip'
      }
      if (control.concealed) return 'skip'
      if (plan.action === 'leave' && plan.reason === 'confirm-password') {
        // The identifier step's hidden password decoy is not a password field.
        if (!page.hasPasswordField) return 'skip'
        const doc = input.ownerDocument
        requestSavedPasswordConfirmation(() => {
          fillIcimsLoginGate(doc, personalInfo, readIcimsPage())
        })
        return 'skip'
      }
      if (plan.action === 'file') {
        // Select the saved resume on this file input. Do not click it, and do
        // not submit. An "Autofill with resume" control never reaches this branch.
        // iCIMS parses that file and reloads the candidate page; attaching on
        // the next fill repeats the parse. One attach per tab per job.
        return attachIcimsResumeOnce(input)
      }
      if (plan.action === 'select' && (plan.mode === 'country' || plan.mode === 'state')) {
        const doc = input.ownerDocument
        // Country first, then state, in the page's ICIMS.dropdowns registry.
        if (doc) await fillIcimsLocationMenus(doc, personalInfo)
        if (icimsLocationMenuCommitted(input)) return true
      }
      const wrote = applyIcimsPlan(input, plan)
      // Text that did not land must not fall through to the generic matcher,
      // which would toast "Filled" against an empty css_loginName.
      if (plan.action === 'text' && !wrote) return 'skip'
      return wrote
    },
    formChanged: () => {
      if (typeof document === 'undefined') return false
      // Captcha opening adds nodes on the email step. That is not a new
      // application page, and a rescan would write into the form under the puzzle.
      // The person solves hCaptcha. GoFillr does not click it.
      if (isIcimsAccountCreationEmailStep(readIcimsPage())) return false
      const next = icimsFormSignature(document)
      if (!next) return false
      if (!lastFormSignature) {
        lastFormSignature = next
        return false
      }
      if (next === lastFormSignature) return false
      lastFormSignature = next
      return true
    },
  }
}
