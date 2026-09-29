import type { PersonalInfo, SiteRule } from '../../types/index.ts'
import {
  hasIcimsAccountCredentials,
  isIcimsCandidateHost,
  isIcimsLoginPath,
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
  fillIcimsLoginGate,
  icimsFormSignature,
  planIcimsFill,
} from './icimsFields.ts'

function readIcimsPage(): IcimsPageSignals {
  const location = typeof window === 'undefined' ? undefined : window.location
  const root = typeof document === 'undefined' ? undefined : document
  const page: IcimsPageSignals = {
    hostname: location?.hostname || '',
    pathname: location?.pathname || '',
    search: location?.search || '',
    hasPasswordField: pageHasPasswordField(root),
  }
  // `/login` already decides the in-document gate. Scan for "Enter Your Information"
  // only when the path is not enough (the email gate mounted under another URL).
  if (!isIcimsLoginPath(page.pathname, page.search ?? '') && !page.hasPasswordField) {
    page.hasEmailGate = pageHasEmailGate(root)
  }
  return page
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
  if (!isIcimsCandidateHost(page.hostname) || !isIcimsLoginSurface(page)) return
  void (async () => {
    const latest = await readPersonalInfoForIcims(personalInfo)
    if (!hasIcimsAccountCredentials(latest)) {
      await maybeWarnMissingIcimsAccount(latest, page)
      return
    }
    // Email and password only. hCaptcha, the EU/UK checkbox, and every advance
    // button stay untouched so a person can finish the gate and never auto-submit.
    fillIcimsLoginGate(document, latest, page)
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
      if (!isIcimsCandidateHost(page.hostname)) return
      // Job search and the job description share the career-portal host. The gate
      // watcher stays quiet there, and fills email/password once /login or the
      // email-first step is on screen. A missing login still warns.
      syncIcimsLogin(personalInfo)
      return watchIcimsLogin(personalInfo)
    },
    apply: (input, fieldText, personalInfo) => {
      const page = readIcimsPage()
      const plan = planIcimsFill(controlFromElement(input, fieldText), personalInfo, {
        loginSurface: isIcimsCandidateHost(page.hostname) && isIcimsLoginSurface(page),
      })
      return applyIcimsPlan(input, plan)
    },
    formChanged: () => {
      if (typeof document === 'undefined') return false
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
