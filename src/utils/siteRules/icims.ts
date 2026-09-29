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

function readIcimsPage(): IcimsPageSignals {
  const page: IcimsPageSignals = {
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    search: window.location.search,
    hasPasswordField: pageHasPasswordField(document),
  }
  // `/login` already decides the in-document gate. Scan for "Enter Your Information"
  // only when the path is not enough (the email gate mounted under another URL).
  if (!isIcimsLoginPath(page.pathname, page.search ?? '') && !page.hasPasswordField) {
    page.hasEmailGate = pageHasEmailGate(document)
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

function watchForIcimsLoginSurface(personalInfo: PersonalInfo | null | undefined) {
  if (typeof MutationObserver === 'undefined') return
  const root = document.documentElement ?? document.body
  if (!root) return

  const observer = new MutationObserver(() => {
    const page = readIcimsPage()
    if (!isIcimsLoginSurface(page)) return
    observer.disconnect()
    void maybeWarnMissingIcimsAccount(personalInfo, page)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}

export default function icimsConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('icims.com'),
    onMount: (personalInfo) => {
      const page = readIcimsPage()
      if (!isIcimsCandidateHost(page.hostname)) return
      if (isIcimsLoginSurface(page)) {
        void maybeWarnMissingIcimsAccount(personalInfo, page)
        return
      }
      // The login form is sometimes injected after the job page loads, without a
      // navigation the content script would see as a new document.
      return watchForIcimsLoginSurface(personalInfo)
    },
    apply: (input, fieldText, personalInfo) => {
      if (input.getAttribute('autocomplete') == 'email') {
        input.value = personalInfo.email || ''
        return true
      } else if (fieldText.includes('AddressStreet2')) {
        // disable inputting
        return true
      }
      return false
    },
  }
}
