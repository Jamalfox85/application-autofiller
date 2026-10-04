import { RELATIVE_MATCHES } from '../relativeMatches.ts'
import {
  degreeSearchValues,
  isAuthorizedToWork,
  pickSponsorshipOption,
  pickWorkAuthorizationOption,
  profileRequiresSponsorship,
} from './greenhouseValues.ts'

// Selectors and page ids taken from the current candidate-experience bundles
// (cx-jobs and candidate-experience-apply-flow): Apply Manually is
// data-automation-id="applyManually", email sign-in is SignInWithEmailButton,
// My Information is applyFlowMyInfoPage, and My Experience is applyFlowMyExpPage.
// Section headings become aria-labelledby={`${label}-section`} with spaces
// replaced by hyphens, so a tenant label other than "Work Experience" must
// still be found from the heading text.

export const WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR =
  '[data-automation-id="SignInWithEmailButton"], [data-automation-id="signInWithEmailButton"]'

// Salesforce's chooser uses signInLink instead of SignInWithEmailButton.
// It is a sign-in control only when the Create Account form is not already open.
export const WORKDAY_SIGN_IN_LINK_SELECTOR = '[data-automation-id="signInLink"]'

// Job postings use adventureButton for the Apply control that opens the method
// chooser. Other adventure buttons (search, banners) share that id, so the
// visible label has to be Apply. This is not Submit.

export const WORKDAY_CREATE_ACCOUNT_SELECTOR = '[data-automation-id="createAccountLink"]'

export const WORKDAY_APPLY_FLOW_PAGE = 'applyFlowPage'
export const WORKDAY_MY_INFO_PAGE = 'applyFlowMyInfoPage'
export const WORKDAY_MY_EXPERIENCE_PAGE = 'applyFlowMyExpPage'

export type WorkdayContactKey =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'address1'
  | 'address2'
  | 'city'
  | 'postal'
  | 'phone'
  | 'email'

export type WorkdaySectionKind = 'experience' | 'education'

export type WorkdayFieldProbe = {
  id?: string | null
  name?: string | null
  getAttribute?: (name: string) => string | null
}

const CONTACT_PATHS: Array<[string, WorkdayContactKey]> = [
  ['name--legalname--firstname', 'firstName'],
  ['legalnamesection_firstname', 'firstName'],
  ['name--legalname--middlename', 'middleName'],
  ['legalnamesection_middlename', 'middleName'],
  ['name--legalname--lastname', 'lastName'],
  ['legalnamesection_lastname', 'lastName'],
  ['address--addressline1', 'address1'],
  ['addresssection_addressline1', 'address1'],
  ['address--addressline2', 'address2'],
  ['addresssection_addressline2', 'address2'],
  ['address--city', 'city'],
  ['addresssection_city', 'city'],
  ['address--postalcode', 'postal'],
  ['addresssection_postalcode', 'postal'],
  ['phonenumber--phonenumber', 'phone'],
  ['emailaddress', 'email'],
]

function normToken(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, '')
}

function pathHit(blob: string, path: string): boolean {
  const value = normToken(blob).replace(/^formfield-/, '')
  const target = normToken(path).replace(/^formfield-/, '')
  if (!value || !target) return false
  if (value === target) return true
  return value.endsWith(`--${target}`)
}

export function workdayContactKey(input: WorkdayFieldProbe): WorkdayContactKey | null {
  const read = (attr: string) => input.getAttribute?.(attr) || ''
  const blobs = [input.id || '', input.name || '', read('name'), read('data-fkit-id'), read('data-automation-id')]
  for (const blob of blobs) {
    for (const [path, key] of CONTACT_PATHS) {
      if (pathHit(blob, path)) return key
    }
  }
  return null
}

// The input id is the form-kit path (`name--legalName--firstName`). Older
// widgets put that path on the wrapper's data-fkit-id instead.
export function workdayContactKeyFromElement(input: Element): WorkdayContactKey | null {
  const own = workdayContactKey({
    id: input.id,
    getAttribute: (name) => input.getAttribute(name),
  })
  if (own) return own
  const field = input.closest('[data-fkit-id]')
  if (!field || field === input) return null
  return workdayContactKey({
    id: field.getAttribute('data-fkit-id'),
    getAttribute: (name) => field.getAttribute(name),
  })
}

export function workdayIsCustomSourceField(input: WorkdayFieldProbe): boolean {
  const read = (attr: string) => normToken(input.getAttribute?.(attr) || '')
  const blobs = [normToken(input.id || ''), normToken(input.name || ''), read('name'), read('data-fkit-id'), read('data-automation-id')]
  return blobs.some((value) => {
    const bare = value.replace(/^formfield-/, '')
    return bare === 'source' || bare.endsWith('--source') || bare.includes('howdidyouhearaboutus')
  })
}

export function workdayJobApplyButton(root: ParentNode): HTMLElement | null {
  if (root.querySelector('[data-automation-id="applyManually"]')) return null
  const buttons = root.querySelectorAll('[data-automation-id="adventureButton"]')
  for (const button of Array.from(buttons)) {
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (text === 'apply') return button as HTMLElement
  }
  return null
}

function controlLabel(el: Element): string {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return `${text} ${aria}`.replace(/\s+/g, ' ').trim()
}

// The apply chooser offers these instead of a file input. They parse the resume
// into the application. GoFillr already fills the fields, so they are never clicked.
export function isWorkdayResumeAutofillControl(el: Element): boolean {
  const label = controlLabel(el)
  return (
    label.includes('autofill with resume') ||
    label.includes('autofill from resume') ||
    label.includes('use my last application') ||
    label.includes('use last application')
  )
}

export function isWorkdayApplicationSubmitControl(el: Element): boolean {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const label = aria || text
  return label === 'submit' || label === 'submit application' || label === 'send'
}

function allowedApplyChooserTarget(el: Element | null): HTMLElement | null {
  if (!el) return null
  if (isWorkdayResumeAutofillControl(el) || isWorkdayApplicationSubmitControl(el)) return null
  return el as HTMLElement
}

// Apply on the job page, then Apply Manually on the chooser. Never Autofill with
// Resume, Use My Last Application, Submit, Submit Application, or Send.
export function workdayApplyChooserTarget(
  root: ParentNode,
  state: { jobApplyClicked?: boolean } = {},
): HTMLElement | null {
  const manual = allowedApplyChooserTarget(root.querySelector('[data-automation-id="applyManually"]'))
  if (manual) return manual
  if (state.jobApplyClicked) return null
  return allowedApplyChooserTarget(workdayJobApplyButton(root))
}

// Account creation renders email + password + verifyPassword together.
// Cisco and Zillow put those automation ids on the inputs. Salesforce puts
// formField-* wrappers around the inputs and may omit the bare ids. My
// Information's email control is emailAddress and must not count.
export function isWorkdayAccountCreationForm(root: ParentNode): boolean {
  const fields = workdayAccountInputs(root)
  return !!(fields.email && fields.password && fields.verifyPassword)
}

// Salesforce and Zillow Create Account can redirect to the same Workday /login:
// email + password, no visible verifyPassword. A hidden create-account block on
// that page is not the sign-in form. It is not My Information either.
export function isWorkdaySignInForm(root: ParentNode): boolean {
  if (isWorkdayAccountCreationForm(root)) return false
  const fields = workdayAccountInputs(root)
  return !!(fields.email && fields.password && !fields.verifyPassword)
}

export function workdaySignInInputs(root: ParentNode): {
  email: HTMLInputElement | null
  password: HTMLInputElement | null
} {
  if (!isWorkdaySignInForm(root)) return { email: null, password: null }
  const fields = workdayAccountInputs(root)
  return { email: fields.email, password: fields.password }
}

// Cisco Apply Manually lands on Create Account with no SignInWithEmailButton.
// Skip the sign-in click when that control is absent, and also once the account
// form or the /login form is already on the page. Salesforce's signInLink and
// Zillow's signInLink plus utilityButtonSignIn must not pull us off Create Account.
export function workdaySignInWithEmailButton(root: ParentNode): HTMLElement | null {
  if (isWorkdayAccountCreationForm(root) || isWorkdaySignInForm(root)) return null
  return root.querySelector(
    `${WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR}, ${WORKDAY_SIGN_IN_LINK_SELECTOR}`,
  ) as HTMLElement | null
}

export function workdayCreateAccountLink(root: ParentNode): HTMLElement | null {
  if (isWorkdayAccountCreationForm(root) || isWorkdaySignInForm(root)) return null
  return root.querySelector(WORKDAY_CREATE_ACCOUNT_SELECTOR) as HTMLElement | null
}

// Cisco does not render createAccountCheckbox. Callers click it only when present.
export function workdayAccountAgreementCheckbox(root: ParentNode): HTMLInputElement | null {
  const box = root.querySelector('[data-automation-id="createAccountCheckbox"]')
  if (!box || box.tagName !== 'INPUT') return null
  return box as HTMLInputElement
}

function smallestAccountCard(password: Element): Element | null {
  let node: Element | null = password.parentElement
  while (node) {
    const verify = workdayFieldControl(node, 'verifyPassword')
    if (verify && verify !== password) return node
    node = node.parentElement
  }
  return null
}

function isPageNavigationLabel(el: Element): boolean {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return text === 'next' || text === 'continue' || text === 'back' || text === 'save and continue'
}

// Cisco and Salesforce use createAccountSubmitButton. Zillow omits it and puts
// the handler on a click_filter inside the account card. A page-level
// click_filter (Next) is not a fallback. Sign-in controls are not this button.
export function workdayAccountSubmitControl(root: ParentNode): HTMLElement | null {
  const submit = root.querySelector('[data-automation-id="createAccountSubmitButton"]')
  if (submit) return submit as HTMLElement
  if (!isWorkdayAccountCreationForm(root)) return null
  const password = workdayAccountInputs(root).password
  if (!password) return null
  const card = smallestAccountCard(password)
  if (!card) return null
  const filters: HTMLElement[] = []
  if (card.getAttribute('data-automation-id') === 'click_filter') filters.push(card as HTMLElement)
  for (const el of Array.from(card.querySelectorAll('[data-automation-id="click_filter"]'))) {
    filters.push(el as HTMLElement)
  }
  const local = filters.filter((el) => !isPageNavigationLabel(el))
  const labeled = local.find((el) => /create account|sign up/i.test(el.textContent || ''))
  if (labeled) return labeled
  const doc = card.ownerDocument
  const pageRoot = card === doc?.body || card === doc?.documentElement
  if (pageRoot) {
    return local.find((el) => el.contains(password)) || null
  }
  return local[0] || null
}

export function workdaySectionKindFromLabel(label: string): WorkdaySectionKind | null {
  const norm = label.toLowerCase().replace(/[^a-z]/g, '')
  if (!norm) return null
  if (norm.includes('education') || norm.includes('academic')) return 'education'
  // "Work Experience", "Professional Experience", "My Experience 1", "Employment History".
  if (norm.includes('experience') || norm.includes('employment') || norm.includes('workhistory')) {
    return 'experience'
  }
  return null
}

function headingText(root: ParentNode, labelledBy: string): string {
  const asDoc = root as Document
  const doc = typeof asDoc.getElementById === 'function' ? asDoc : (root as Node).ownerDocument
  if (!doc) return ''
  return (doc.getElementById(labelledBy)?.textContent || '').replace(/\s+/g, ' ').trim()
}

export function findWorkdaySectionAddButton(
  root: ParentNode,
  kind: WorkdaySectionKind,
): HTMLElement | null {
  const groups = root.querySelectorAll('[role="group"][aria-labelledby$="-section"]')
  for (const group of Array.from(groups)) {
    const labelledBy = group.getAttribute('aria-labelledby') || ''
    if (workdaySectionKindFromLabel(headingText(root, labelledBy)) !== kind) continue
    const button = group.querySelector('[data-automation-id="add-button"]')
    if (button) return button as HTMLElement
  }
  return null
}

export function listWorkdayPanels(root: ParentNode, kind: WorkdaySectionKind): Element[] {
  const groups = root.querySelectorAll('[role="group"][aria-labelledby$="-panel"]')
  return Array.from(groups).filter((group) => {
    const labelledBy = group.getAttribute('aria-labelledby') || ''
    const text = headingText(root, labelledBy) || labelledBy.replace(/-panel$/, '').replace(/-/g, ' ')
    return workdaySectionKindFromLabel(text) === kind
  })
}

function workdayPanelElement(node: Element): Element | null {
  return node.closest('[role="group"][aria-labelledby$="-panel"]')
}

export function workdayInputInExperiencePanel(node: Element): boolean {
  const panel = workdayPanelElement(node)
  if (!panel) return false
  const labelledBy = panel.getAttribute('aria-labelledby') || ''
  const text = headingText(panel, labelledBy) || labelledBy.replace(/-panel$/, '').replace(/-/g, ' ')
  return workdaySectionKindFromLabel(text) === 'experience'
}

function experienceControlValue(panel: ParentNode, metadataId: string): string {
  const control = workdayFieldControl(panel, metadataId)
  if (!control) return ''
  if (control.tagName !== 'INPUT' && control.tagName !== 'TEXTAREA') return ''
  return ((control as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim()
}

export function workdayExperiencePanelIdentity(panel: ParentNode): { jobTitle: string; companyName: string } {
  return {
    jobTitle: experienceControlValue(panel, 'jobTitle'),
    companyName: experienceControlValue(panel, 'companyName'),
  }
}

function sameExperienceText(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

// A row already on the page is the profile job when both title and company match.
// An empty title or company is not that job; the filler reuses a fully blank row
// instead of treating it as a copy.
export function workdayPanelMatchesExperience(
  panel: ParentNode,
  job: { jobTitle?: string | null; companyName?: string | null },
): boolean {
  const have = workdayExperiencePanelIdentity(panel)
  const title = (job.jobTitle || '').replace(/\s+/g, ' ').trim()
  const company = (job.companyName || '').replace(/\s+/g, ' ').trim()
  if (!title || !company || !have.jobTitle || !have.companyName) return false
  return sameExperienceText(have.jobTitle, title) && sameExperienceText(have.companyName, company)
}

export function workdayExperiencePanelIsBlank(panel: ParentNode): boolean {
  const have = workdayExperiencePanelIdentity(panel)
  return !have.jobTitle && !have.companyName
}

function isWorkdayTextControl(el: Element): boolean {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
}

// Prefer a formField-* control: the wrapper itself when it is an input or
// textarea, otherwise the nested control. An empty wrapper does not hide a
// later one. Otherwise fall back to the bare automation id on the input
// (Cisco account fields) and then the form-kit path.
export function workdayFieldControl(root: ParentNode, metadataId: string): Element | null {
  const wrappedNodes = root.querySelectorAll(`[data-automation-id="formField-${metadataId}"]`)
  for (const wrapped of Array.from(wrappedNodes)) {
    if (isWorkdayTextControl(wrapped)) return wrapped
    const nested = wrapped.querySelector('input, textarea')
    if (nested) return nested
  }
  const direct = root.querySelector(`[data-automation-id="${metadataId}"]`)
  if (direct && isWorkdayTextControl(direct)) return direct
  const byPath = root.querySelector(`[data-fkit-id$="--${metadataId}"], [data-fkit-id="${metadataId}"]`)
  if (!byPath) return null
  if (isWorkdayTextControl(byPath)) return byPath
  return byPath.querySelector('input, textarea')
}

export type WorkdayAccountInputs = {
  email: HTMLInputElement | null
  password: HTMLInputElement | null
  verifyPassword: HTMLInputElement | null
}

function isAccountDecoy(el: Element): boolean {
  let node: Element | null = el
  while (node) {
    if (node === el) {
      const type = (node.getAttribute('type') || '').toLowerCase()
      if (type === 'hidden') return true
      const auto = (node.getAttribute('data-automation-id') || '').toLowerCase()
      if (auto.includes('beecatcher') || auto.includes('honeypot')) return true
    }
    if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return true
    const style = (node.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '')
    if (style.includes('display:none') || style.includes('visibility:hidden')) return true
    node = node.parentElement
  }
  return false
}

function isVerifyPasswordInput(el: Element): boolean {
  const wrapperId = el.closest('[data-automation-id]')?.getAttribute('data-automation-id') || ''
  const path = el.closest('[data-fkit-id]')?.getAttribute('data-fkit-id') || ''
  const blob = `${el.id} ${el.getAttribute('name') || ''} ${el.getAttribute('data-automation-id') || ''} ${wrapperId} ${path}`
  return blob.toLowerCase().replace(/[^a-z]/g, '').includes('verifypassword')
}

function isMyInformationEmail(el: Element): boolean {
  const wrapperId = el.closest('[data-automation-id]')?.getAttribute('data-automation-id') || ''
  const path = el.closest('[data-fkit-id]')?.getAttribute('data-fkit-id') || ''
  const blob = `${el.id} ${el.getAttribute('name') || ''} ${el.getAttribute('data-automation-id') || ''} ${wrapperId} ${path}`
  return blob.toLowerCase().replace(/[^a-z]/g, '').includes('emailaddress')
}

function addAccountCandidate(found: HTMLInputElement[], el: Element | null) {
  if (!el || el.tagName !== 'INPUT') return
  const input = el as HTMLInputElement
  if (found.includes(input) || isAccountDecoy(input)) return
  found.push(input)
}

function workdayAccountCandidates(root: ParentNode, metadataId: string): HTMLInputElement[] {
  const found: HTMLInputElement[] = []
  for (const wrapped of Array.from(root.querySelectorAll(`[data-automation-id="formField-${metadataId}"]`))) {
    if (isWorkdayTextControl(wrapped)) addAccountCandidate(found, wrapped)
    for (const nested of Array.from(wrapped.querySelectorAll('input'))) addAccountCandidate(found, nested)
  }
  for (const direct of Array.from(root.querySelectorAll(`[data-automation-id="${metadataId}"]`))) {
    if (isWorkdayTextControl(direct)) addAccountCandidate(found, direct)
    else for (const nested of Array.from(direct.querySelectorAll('input'))) addAccountCandidate(found, nested)
  }
  for (const byPath of Array.from(
    root.querySelectorAll(`[data-fkit-id$="--${metadataId}"], [data-fkit-id="${metadataId}"]`),
  )) {
    if (isWorkdayTextControl(byPath)) addAccountCandidate(found, byPath)
    else for (const nested of Array.from(byPath.querySelectorAll('input'))) addAccountCandidate(found, nested)
  }
  if (metadataId === 'password') {
    for (const input of Array.from(root.querySelectorAll('input[type="password"]'))) {
      if (!isVerifyPasswordInput(input)) addAccountCandidate(found, input)
    }
  }
  if (metadataId === 'email') {
    for (const input of Array.from(
      root.querySelectorAll('input[type="email"], input[autocomplete="username"]'),
    )) {
      if (!isMyInformationEmail(input)) addAccountCandidate(found, input)
    }
  }
  return found
}

function workdayAccountInput(root: ParentNode, metadataId: string): HTMLInputElement | null {
  let candidates = workdayAccountCandidates(root, metadataId)
  if (metadataId === 'password') candidates = candidates.filter((el) => !isVerifyPasswordInput(el))
  if (metadataId === 'verifyPassword') candidates = candidates.filter((el) => isVerifyPasswordInput(el))
  if (metadataId === 'password') {
    const typed = candidates.find((el) => (el.getAttribute('type') || '').toLowerCase() === 'password')
    if (typed) return typed
  }
  return candidates[0] || null
}

// Account email / password / verify on Create Account or /login. My Information's
// emailAddress control is not an account field.
export function workdayAccountCredentialKind(
  input: Element,
): 'email' | 'password' | 'verifyPassword' | null {
  if (input.tagName !== 'INPUT' || isAccountDecoy(input)) return null
  if (isMyInformationEmail(input)) return null
  if (isVerifyPasswordInput(input)) return 'verifyPassword'
  const type = (input.getAttribute('type') || '').toLowerCase()
  const auto = (input.getAttribute('data-automation-id') || '').toLowerCase()
  const wrapper = (input.closest('[data-automation-id]')?.getAttribute('data-automation-id') || '').toLowerCase()
  const compact = `${input.id} ${input.getAttribute('name') || ''} ${auto} ${wrapper}`
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (type === 'password' || compact.includes('password')) return 'password'
  if (
    auto === 'email' ||
    wrapper === 'formfield-email' ||
    type === 'email' ||
    (input.getAttribute('autocomplete') || '').toLowerCase() === 'username' ||
    compact === 'email' ||
    compact.endsWith('email')
  ) {
    return 'email'
  }
  return null
}

// Fill targets for Create Account. Same resolution as other Workday fields.
export function workdayAccountInputs(root: ParentNode): WorkdayAccountInputs {
  return {
    email: workdayAccountInput(root, 'email'),
    password: workdayAccountInput(root, 'password'),
    verifyPassword: workdayAccountInput(root, 'verifyPassword'),
  }
}

export function workdayListboxButton(root: ParentNode, metadataId: string): HTMLButtonElement | null {
  const buttons = Array.from(
    root.querySelectorAll(
      [
        `button[name="${metadataId}"]`,
        `button[data-automation-id="${metadataId}"]`,
        `button[data-automation-id="addressSection_${metadataId}"]`,
        `[data-automation-id="formField-${metadataId}"] button[aria-haspopup="listbox"]`,
        `[data-automation-id="${metadataId}"] button[aria-haspopup="listbox"]`,
        `[data-automation-id="addressSection_${metadataId}"] button[aria-haspopup="listbox"]`,
        `[data-fkit-id="${metadataId}"] button[aria-haspopup="listbox"]`,
        `[data-fkit-id$="--${metadataId}"] button[aria-haspopup="listbox"]`,
        `button[id$="${metadataId}"][aria-haspopup="listbox"]`,
      ].join(', '),
    ),
  ).filter((node): node is HTMLButtonElement => node.tagName === 'BUTTON')
  if (buttons.length === 0) return null
  return buttons.find((button) => button.getAttribute('aria-haspopup') === 'listbox') || buttons[0]
}

// Cisco's My Information prompt uses phone-device-type. Newer form-kit builds use
// phoneType. There is no device-type field on the profile; Mobile / Cell is the default.
const PHONE_DEVICE_TYPE_IDS = ['phone-device-type', 'phoneDeviceType', 'phoneType']

function compactIdBlob(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => !!value)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

function controlVisibleLabel(control: Element): string {
  const doc = control.ownerDocument
  const labelled: string[] = []
  const ids = (control.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
  if (doc) {
    for (const id of ids) labelled.push(doc.getElementById(id)?.textContent || '')
  }
  return `${control.getAttribute('aria-label') || ''} ${labelled.join(' ')} ${control.textContent || ''}`
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Phone device type is not a source question and not a former-employee question.
// The id may sit on an ancestor (promptIcon inside phone-device-type / phoneType)
// while a page-level label still says "How Did You Hear About Us?".
export function workdayElementIsPhoneDeviceType(control: Element): boolean {
  let node: Element | null = control
  for (let depth = 0; node && depth < 8; depth++) {
    const blob = compactIdBlob([
      node.id,
      node.getAttribute('name'),
      node.getAttribute('data-automation-id'),
      node.getAttribute('data-fkit-id'),
    ])
    if (blob.includes('countryphonecode')) return false
    if (blob.includes('phonedevicetype') || blob.includes('phonetype')) return true
    const automation = node.getAttribute('data-automation-id') || ''
    if (depth > 0 && automation.startsWith('formField-')) break
    node = node.parentElement
  }
  const visible = controlVisibleLabel(control)
  return visible.includes('phone device type') || visible.includes('device type')
}

// promptOption rows Mobile / Landline / Fax (or Cell). Not a source dropdown.
export function workdayIsPhoneDeviceTypeOptionList(optionTexts: string[]): boolean {
  const keys = optionTexts
    .map((text) => text.toLowerCase().replace(/[^a-z]/g, ''))
    .filter((key) => key && !['selectone', 'select', 'pleaseselect', 'chooseone'].includes(key))
  if (keys.length === 0) return false
  const hasMobile = keys.some((key) => phoneTypeRank(key) > 0)
  if (!hasMobile) return false
  const device = new Set(['landline', 'fax', 'voip', 'work', 'home', 'office', 'telephone'])
  return keys.every((key) => phoneTypeRank(key) > 0 || device.has(key))
}

export function workdayPhoneDeviceTypeButton(root: ParentNode): HTMLButtonElement | null {
  for (const id of PHONE_DEVICE_TYPE_IDS) {
    const button = workdayListboxButton(root, id)
    if (button && workdayElementIsPhoneDeviceType(button)) return button
  }
  const buttons = root.querySelectorAll('button')
  for (const button of Array.from(buttons)) {
    if (workdayElementIsPhoneDeviceType(button)) return button as HTMLButtonElement
  }
  return null
}

export function workdayListboxValue(button: HTMLElement): string {
  const selected = button.querySelector(
    '[data-automation-id="promptSelectionLabel"], [data-automation-id="selectedItemLabel"]',
  )
  const raw = selected?.textContent || button.textContent || ''
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// The open menu. aria-controls wins so a state click cannot land on a country
// option that is still in the document (Georgia is both). A phone device menu
// (Mobile / Landline / Fax) is not a source or former-employee menu, and the
// source menu is not where Mobile is chosen.
export function workdayActivePrompt(button: HTMLElement): ParentNode | null {
  const doc = button.ownerDocument
  if (!doc) return null
  const controls = button.getAttribute('aria-controls')
  if (controls) {
    const owned = doc.getElementById(controls)
    if (owned) return owned
  }
  const prompts = Array.from(
    doc.querySelectorAll(
      '[data-automation-id="responsiveMonikerPrompt"], [data-automation-id="promptPopup"], [role="listbox"]',
    ),
  ).filter((node) => {
    if (button.contains(node)) return false
    // Selected pills use role=listbox. That list is not the open degree menu.
    if (node.getAttribute('data-automation-id') === 'selectedItemList') return false
    if (node.closest('[data-automation-id="selectedItemList"]')) return false
    return true
  })
  const labelsOf = (prompt: Element) => workdayOptionLabels(prompt as ParentNode)
  const phoneButton = workdayElementIsPhoneDeviceType(button)
  if (phoneButton) {
    const phoneLists = prompts.filter((prompt) => workdayIsPhoneDeviceTypeOptionList(labelsOf(prompt)))
    if (phoneLists.length === 1) return phoneLists[0] as ParentNode
    if (phoneLists.length > 1) return phoneLists[phoneLists.length - 1] as ParentNode
    return null
  }
  const nonPhone = prompts.filter((prompt) => !workdayIsPhoneDeviceTypeOptionList(labelsOf(prompt)))
  if (nonPhone.length !== prompts.length) {
    if (nonPhone.length === 1) return nonPhone[0] as ParentNode
    if (nonPhone.length > 1 && button.getAttribute('aria-expanded') === 'true') {
      return nonPhone[nonPhone.length - 1] as ParentNode
    }
    return null
  }
  if (prompts.length === 1) return prompts[0] as ParentNode
  if (prompts.length > 1 && button.getAttribute('aria-expanded') === 'true') {
    return prompts[prompts.length - 1] as ParentNode
  }
  return null
}

const PROMPT_OPTION_SELECTOR = [
  '[role="option"]',
  '[data-automation-id="promptOption"]',
  '[data-automation-id="promptLeafNode"]',
  '[data-automation-id="menuItem"]',
].join(', ')

function promptOptionLabel(node: Element): string {
  const raw = node.getAttribute('data-automation-label') || node.textContent || ''
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function workdayOptionElements(root: ParentNode): Array<{ label: string; element: HTMLElement }> {
  const labeled = Array.from(root.querySelectorAll(PROMPT_OPTION_SELECTOR))
    .map((node) => ({ element: node as HTMLElement, label: promptOptionLabel(node) }))
    .filter((choice) => choice.label.length > 0)
  // A promptOption often wraps an empty role=option plus the visible text row.
  // Dropping every parent that contains another selector match hides that label.
  // Keep the innermost node that actually has a label.
  return labeled.filter(
    (choice) =>
      !choice.element.closest('[data-automation-id="selectedItemList"]') &&
      !labeled.some(
        (other) => other.element !== choice.element && choice.element.contains(other.element),
      ),
  )
}

export function workdayOptionLabels(root: ParentNode): string[] {
  return workdayOptionElements(root).map((choice) => choice.label)
}

// The node Workday paints the label on. Clicking the promptOption wrapper
// misses when the handler is on the inner row (the text the menu shows).
function visiblePromptRow(element: HTMLElement, label: string): HTMLElement {
  const want = label.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  if (!want) return element
  const matches = Array.from(element.querySelectorAll('*')).filter((node) => {
    const text = (node.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    if (text !== want) return false
    return !Array.from(node.children).some(
      (child) => (child.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() === want,
    )
  })
  return (matches[matches.length - 1] as HTMLElement) || element
}

export function workdayOptionElement(root: ParentNode, label: string): HTMLElement | null {
  const want = normalizeListedKey(label)
  if (!want) return null
  const match = workdayOptionElements(root).find((choice) => normalizeListedKey(choice.label) === want)
  if (!match) return null
  return visiblePromptRow(match.element, match.label)
}

function cleanPromptLabel(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function degreeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// School and field-of-study suggestions commit only when the row is the typed
// name or that name plus a location suffix. A shorter catalog row that merely
// shares a word ("State University") is not a match.
export function workdaySuggestionOption(optionTexts: string[], query: string): string | null {
  const labels = optionTexts.map(cleanPromptLabel).filter(Boolean)
  const want = query.toLowerCase().trim()
  if (want.length < 2) return null
  const norm = labels.map((label) => label.toLowerCase())
  const exact = norm.findIndex((text) => text === want)
  if (exact >= 0) return labels[exact]
  const starts = norm
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.startsWith(want))
  if (starts.length > 0) {
    starts.sort((a, b) => a.text.length - b.text.length)
    return labels[starts[0].index]
  }
  const includes = norm
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.includes(want))
  if (includes.length > 0) {
    includes.sort((a, b) => a.text.length - b.text.length)
    return labels[includes[0].index]
  }
  return null
}

type DegreeFamily =
  | 'ged'
  | 'high_school'
  | 'associate'
  | 'bachelor'
  | 'master'
  | 'jd'
  | 'doctorate'

// Profile values are the education dialog slugs (high_school_diploma, associates,
// bachelors, masters, phd, certificate, bootcamp) and resume text such as
// "Bachelor of Science". JD is checked before doctorate so "Juris Doctor" is
// not treated as a PhD. GED and High School are different Workday options.
function degreeFamily(value: string): DegreeFamily | null {
  const key = degreeKey(value)
  if (!key) return null
  if (/\b(jd|juris doctor|juris doctorate)\b/.test(key) || key === 'j d') return 'jd'
  if (/\bged\b/.test(key)) return 'ged'
  if (/\b(high school|secondary school)\b/.test(key)) return 'high_school'
  if (/\b(phd|ph d|doctor|doctorate)\b/.test(key)) return 'doctorate'
  if (/\b(mba|master|masters|ms|msc)\b/.test(key)) return 'master'
  if (/\b(bachelor|bachelors|bs|ba|bsc)\b/.test(key)) return 'bachelor'
  if (/\b(associate|associates|aa|as)\b/.test(key)) return 'associate'
  return null
}

// A generic list label ("Bachelor's Degree", "Bachelors"), not a different
// specific degree ("Bachelor of Arts" or "B.A." for a Bachelor of Science profile).
function isGenericDegreeLabel(value: string, family: DegreeFamily): boolean {
  const key = degreeKey(value)
  if (family === 'ged') return key === 'ged'
  if (family === 'high_school') return /^(high school|high school diploma|secondary school)$/.test(key)
  if (family === 'jd') return /^(jd|j d|juris doctor|juris doctorate)$/.test(key)
  if (family === 'doctorate') {
    return /^(phd|ph d|doctor|doctorate|doctoral|doctoral degree|doctor of philosophy)$/.test(key)
  }
  if (family === 'master') return /^(master|masters|masters degree|master s degree)$/.test(key)
  if (family === 'bachelor') return /^(bachelor|bachelors|bachelors degree|bachelor s degree)$/.test(key)
  if (family === 'associate') return /^(associate|associates|associates degree|associate s degree)$/.test(key)
  return false
}

// B.S. and Bachelor of Science are the same listed degree. B.A. is not.
function degreeSpecificity(value: string): string | null {
  const key = degreeKey(value)
  if (!key) return null
  if (/bachelor of science|^bs$|^bsc$/.test(key)) return 'bs'
  if (/bachelor of arts|^ba$/.test(key)) return 'ba'
  if (/master of science|^ms$|^msc$/.test(key)) return 'ms'
  if (/master of arts|^ma$/.test(key)) return 'ma'
  if (/master of business|^mba$|business administration/.test(key)) return 'mba'
  if (/doctor of philosophy|^phd$|^ph d$/.test(key)) return 'phd'
  if (/associate of science|^as$/.test(key)) return 'as'
  if (/associate of arts|^aa$/.test(key)) return 'aa'
  if (/^jd$|^j d$|juris doctor/.test(key)) return 'jd'
  return null
}

function exactDegreeLabel(labels: string[], query: string): string | null {
  const want = degreeKey(query)
  if (!want) return null
  return labels.find((label) => degreeKey(label) === want) || null
}

// Degree is a listed prompt option. Exact catalog text wins, then the same
// degree under another label ("Bachelor of Science" → "Bachelors"). A different
// degree in that family is not selected. Certificate and Bootcamp have no
// Workday degree on the short Adobe list, so they stay empty.
export function workdayDegreeOption(optionTexts: string[], degreeType: string): string | null {
  const labels = optionTexts.map(cleanPromptLabel).filter(Boolean)
  const exact = exactDegreeLabel(labels, degreeType)
  if (exact) return exact
  const contained = workdaySuggestionOption(labels, degreeType)
  if (contained) {
    const wanted = degreeSpecificity(degreeType)
    const got = degreeSpecificity(contained)
    if (!wanted || !got || wanted === got) return contained
  }
  const specificity = degreeSpecificity(degreeType)
  if (specificity) {
    const specific = labels.filter((label) => degreeSpecificity(label) === specificity)
    if (specific.length === 1) return specific[0]
  }
  const family = degreeFamily(degreeType)
  if (family) {
    const inFamily = labels.filter((label) => degreeFamily(label) === family)
    const generic = inFamily.filter((label) => isGenericDegreeLabel(label, family))
    if (generic.length === 1) return generic[0]
    // A generic profile degree ("bachelors") can take the only listed option
    // in that family. A specific profile degree cannot take a different one.
    if (!specificity && inFamily.length === 1) return inFamily[0]
  }
  for (const query of degreeSearchValues(degreeType)) {
    const alias = exactDegreeLabel(labels, query)
    if (!alias || degreeKey(alias) === degreeKey(degreeType)) continue
    const aliasFamily = degreeFamily(alias)
    if (family && aliasFamily && aliasFamily !== family) continue
    if (!family && aliasFamily) continue
    return alias
  }
  return null
}

export function workdayDegreeSearchTexts(degreeType: string): string[] {
  const out: string[] = []
  const push = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (out.some((item) => degreeKey(item) === degreeKey(trimmed))) return
    out.push(trimmed)
  }
  push(degreeType)
  for (const candidate of degreeSearchValues(degreeType)) push(candidate)
  return out.slice(0, 3)
}

export function workdayPromptSearchInput(root: ParentNode): HTMLInputElement | null {
  const input = root.querySelector(
    [
      'input[data-automation-id="searchBox"]',
      'input[data-automation-id="promptSearchInput"]',
      'input[data-automation-id="monikerSearchBox"]',
      '[data-automation-id="monikerSearchBox"] input',
      '[data-automation-id="monikerSearchBoxFullscreen"] input',
    ].join(', '),
  )
  if (!input || input.tagName !== 'INPUT') return null
  return input as HTMLInputElement
}

const DATE_PART_IDS: Record<'month' | 'day' | 'year', string[]> = {
  month: ['dateSectionMonth-input', 'dateSectionMonth'],
  day: ['dateSectionDay-input', 'dateSectionDay'],
  year: ['dateSectionYear-input', 'dateSectionYear'],
}

export function workdayDatePartInput(
  root: ParentNode,
  part: 'month' | 'day' | 'year',
): HTMLInputElement | null {
  for (const automationId of DATE_PART_IDS[part]) {
    const node = root.querySelector(`[data-automation-id="${automationId}"]`)
    if (!node) continue
    if (node.tagName === 'INPUT') return node as HTMLInputElement
    const nested = node.querySelector('input')
    if (nested) return nested as HTMLInputElement
  }
  return null
}

// My Experience panel rows are filled by the section handler. Counting those
// inputs here would retrigger generic autofill while rows are being added.
export function nextWorkdayFormSignature(root: ParentNode): string | null {
  if (!root.querySelector(`[data-automation-id="${WORKDAY_APPLY_FLOW_PAGE}"]`)) return null
  const myInfo = root.querySelector(`[data-automation-id="${WORKDAY_MY_INFO_PAGE}"]`)
  const myExp = root.querySelector(`[data-automation-id="${WORKDAY_MY_EXPERIENCE_PAGE}"]`)
  const page = myInfo || myExp
  if (!page) return null
  const pageId = page.getAttribute('data-automation-id') || 'page'
  if (pageId === WORKDAY_MY_EXPERIENCE_PAGE) return pageId
  const inputs = page.querySelectorAll('input, textarea, select')
  const inputSignature = Array.from(inputs)
    .map((input) => {
      const el = input as HTMLInputElement
      return `${el.tagName}:${el.getAttribute('name') || el.id || el.getAttribute('type') || ''}`
    })
    .join(',')
  return `${pageId}:[${inputSignature}]`
}

// Profile country and state values are snake_case slugs ("united_states", "New_York").
// Workday options are display labels ("United States of America", "New York").
// Underscores become spaces before alias lookup. Short codes stay exact, so "us"
// does not match Georgia or Australia.
function normalizeListedKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchingOptionText(
  optionTexts: string[],
  desired: string,
  kind: 'state' | 'country',
): string | null {
  const want = normalizeListedKey(desired)
  if (!want) return null
  const options = optionTexts
    .map((text) => ({ raw: text, key: normalizeListedKey(text) }))
    .filter((option) => option.key)
  const exact = options.find((option) => option.key === want)
  if (exact) return exact.raw
  const group = RELATIVE_MATCHES[kind].find((aliases) =>
    aliases.some((alias) => normalizeListedKey(alias) === want),
  )
  if (!group) return null
  const aliasKeys = group.map((alias) => normalizeListedKey(alias))
  const hits = options.filter((option) => aliasKeys.includes(option.key))
  if (hits.length === 0) return null
  hits.sort((a, b) => b.key.length - a.key.length)
  return hits[0].raw
}

// Text to type into a Workday prompt search. The shortest multi-word alias
// ("united states") still matches "United States of America". A bare code
// ("ca") does not — use the longest name instead.
export function workdayListedSearchText(desired: string, kind: 'state' | 'country'): string {
  const want = normalizeListedKey(desired)
  if (!want) return ''
  const group = RELATIVE_MATCHES[kind].find((aliases) =>
    aliases.some((alias) => normalizeListedKey(alias) === want),
  )
  if (!group) return want
  const keys = group.map((alias) => normalizeListedKey(alias)).filter(Boolean)
  const phrases = keys.filter((alias) => alias.includes(' '))
  if (phrases.length > 0) {
    phrases.sort((a, b) => a.length - b.length)
    return phrases[0]
  }
  keys.sort((a, b) => b.length - a.length)
  return keys[0] || want
}

export function workdayListedValueMatches(
  currentText: string,
  desired: string,
  kind: 'state' | 'country',
): boolean {
  const current = currentText.replace(/\s+/g, ' ').trim()
  if (!current || !desired.trim()) return false
  return matchingOptionText([current], desired, kind) != null
}

function phoneTypeRank(text: string): number {
  const key = text.toLowerCase().replace(/[^a-z]/g, '')
  if (!key || key.includes('fax')) return 0
  if (key === 'mobile' || key === 'cell' || key === 'cellular') return 3
  if (key === 'mobilephone' || key === 'cellphone' || key === 'cellularphone') return 2
  if (key.includes('mobile') || (key.includes('cell') && !key.includes('cancel'))) return 1
  return 0
}

// No profile field stores device type. Mobile, then Cell, is the default already
// used on My Information. Landline, fax, and country names are not a fallback.
export function workdayPhoneTypeOption(optionTexts: string[]): string | null {
  const options = optionTexts
    .map((text) => text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let best: string | null = null
  let bestRank = 0
  for (const text of options) {
    const rank = phoneTypeRank(text)
    if (rank > bestRank) {
      best = text
      bestRank = rank
    }
  }
  return best
}

export type WorkdaySelectKind = 'country' | 'state' | 'phone' | 'source' | 'no'

export function workdaySelectKind(input: Element, fieldText = ''): WorkdaySelectKind | null {
  if (input.tagName !== 'SELECT') return null
  const wrapperAutomation = input.closest('[data-automation-id]')?.getAttribute('data-automation-id') || ''
  const wrapperPath = input.closest('[data-fkit-id]')?.getAttribute('data-fkit-id') || ''
  const compact = [
    input.id,
    input.getAttribute('name') || '',
    input.getAttribute('data-automation-id') || '',
    wrapperAutomation,
    wrapperPath,
    fieldText,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

  if (
    compact.includes('phonedevicetype') ||
    compact.includes('phonetype') ||
    compact.includes('devicetype')
  ) {
    return 'phone'
  }
  if (compact.includes('countryregion')) return 'state'
  if (compact.includes('phonecode') || compact.includes('countrycode') || compact.includes('dialing')) return null
  if (compact.includes('country')) return 'country'
  if (
    compact.includes('state') &&
    !compact.includes('statement') &&
    !compact.includes('estate') &&
    !compact.includes('unitedstates')
  ) {
    return 'state'
  }
  return null
}

export function workdaySelectValue(
  options: Array<{ value: string; text: string }>,
  desired: string,
  kind: WorkdaySelectKind,
): string | null {
  const texts = options.map((option) => option.text)
  const label =
    kind === 'phone'
      ? workdayPhoneTypeOption(texts)
      : kind === 'source'
        ? workdaySourceOption(texts)
        : kind === 'no'
          ? workdaySafeNoOption(texts)
          : matchingOptionText(texts, desired, kind)
  if (!label) return null
  const want = normalizeListedKey(label)
  const match = options.find((option) => normalizeListedKey(option.text) === want)
  return match ? match.value : null
}

// "How did you hear" has no vault answer. It is still required on My Information.
// Commit Indeed when that row is listed. Do not invent a label, and do not answer Yes.
export function workdayIsSourceQuestion(fieldText: string): boolean {
  const compact = fieldText.toLowerCase().replace(/[^a-z]/g, '')
  if (!compact) return false
  return (
    compact.includes('howdidyouhear') ||
    compact.includes('wheredidyouhear') ||
    compact.includes('howdidyoufindthis') ||
    compact.includes('howdidyoufindout') ||
    compact.includes('howdidyoulearnabout')
  )
}

// Former / previous employee and "have you worked here" are Yes/No. The safe
// answer is No. "I currently work here" on a past role is a different control.
// Cisco Application Questions. Authorization and sponsorship use the saved
// profile. Years and government questions have no stored answer, so they stay
// unanswered. A government question is not a former-employee question.
export type WorkdayApplicationQuestion = 'authorized' | 'sponsorship' | 'years' | 'government'

export function workdayApplicationQuestionKind(
  control?: Element | null,
  fieldText = '',
): WorkdayApplicationQuestion | null {
  const text = `${fieldText} ${control ? workdayChoiceQuestionText(control) : ''}`
  const compact = text.toLowerCase().replace(/[^a-z]/g, '')
  if (!compact) return null
  if (isWorkdayGovernmentQuestion(compact)) return 'government'
  if (isWorkdayYearsQuestion(compact)) return 'years'
  if (isWorkdaySponsorshipQuestion(compact)) return 'sponsorship'
  if (isWorkdayAuthorizedQuestion(compact)) return 'authorized'
  return null
}

function isWorkdayGovernmentQuestion(compact: string): boolean {
  if (compact.includes('foreigngovernment') || compact.includes('governmentofficial') || compact.includes('governmententity')) {
    return true
  }
  return compact.includes('government') && (compact.includes('family') || compact.includes('relationship') || compact.includes('relative'))
}

function isWorkdayYearsQuestion(compact: string): boolean {
  if (compact.includes('yearsofage') || compact.includes('yearsold')) return false
  return compact.includes('howmanyyears') || (compact.includes('years') && compact.includes('experience'))
}

function isWorkdaySponsorshipQuestion(compact: string): boolean {
  return compact.includes('sponsor') || compact.includes('employmentvisa') || compact.includes('temporaryvisa')
}

function isWorkdayAuthorizedQuestion(compact: string): boolean {
  if (compact.includes('sponsor')) return false
  return (
    compact.includes('legallyauthorized') ||
    compact.includes('authorizedtowork') ||
    compact.includes('authorisedtowork') ||
    compact.includes('workauthorization') ||
    compact.includes('eligibletowork') ||
    compact.includes('eligibilitytowork')
  )
}

// The yes/no word implied by the saved profile. Null when the profile has no
// answer. The caller still has to find that word among the options this control
// actually lists.
export function workdayProfileChoice(
  kind: 'authorized' | 'sponsorship',
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): 'yes' | 'no' | null {
  const status = (info.workAuthorization || '').trim()
  const sponsorship = (info.sponsorshipRequired || '').trim()
  if (kind === 'authorized') {
    if (!status) return null
    return isAuthorizedToWork(status) ? 'yes' : 'no'
  }
  if (!status && !sponsorship) return null
  return profileRequiresSponsorship({ workAuthorization: status, sponsorshipRequired: sponsorship }) ? 'yes' : 'no'
}

export function workdayListedProfileOption(
  labels: string[],
  kind: 'authorized' | 'sponsorship',
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): string | null {
  const status = (info.workAuthorization || '').trim()
  const sponsorship = (info.sponsorshipRequired || '').trim()
  if (kind === 'authorized') {
    if (!status) return null
    return pickWorkAuthorizationOption(labels, status)
  }
  if (!status && !sponsorship) return null
  return pickSponsorshipOption(
    labels,
    profileRequiresSponsorship({ workAuthorization: status, sponsorshipRequired: sponsorship }),
  )
}

export function workdayIsFormerEmployeeQuestion(fieldText: string): boolean {
  const compact = fieldText.toLowerCase().replace(/[^a-z]/g, '')
  if (!compact) return false
  if (isWorkdayGovernmentQuestion(compact)) return false
  if (
    compact.includes('currentlyworkhere') &&
    !compact.includes('former') &&
    !compact.includes('previous') &&
    !compact.includes('haveyouworked')
  ) {
    return false
  }
  const phrases = [
    'formeremployee',
    'previouslyemployed',
    'previouslybeenemployed',
    'previousemployee',
    'previousworker',
    'prioremployee',
    'exemployee',
    'ciscoemployee',
    'haveyouworkedhere',
    'haveyoueverworked',
    'haveyouworkedfor',
    'haveyoupreviouslyworked',
    'haveyoueverbeenemployed',
    'everbeenanemployee',
    'everbeenemployed',
    'currentorformer',
    'currentemployee',
    'workedherebefore',
    'workedforthiscompany',
    'workedasacontractor',
    'employedbythis',
    'employedbyus',
    'employedhere',
  ]
  if (phrases.some((phrase) => compact.includes(phrase))) return true
  return compact.includes('employee') && compact.includes('emailid')
}

function probeFrom(el: Element): WorkdayFieldProbe {
  return {
    id: el.id,
    name: el.getAttribute('name'),
    getAttribute: (name) => el.getAttribute(name),
  }
}

// Education "School or University" is a prompt. The closed input can show a
// typed name while Workday still says the field has no value. LinkedIn, degree,
// and former-employee questions are different controls.
export function workdayElementIsSchool(input: Element, fieldText = ''): boolean {
  if (workdayElementIsPhoneDeviceType(input)) return false
  if (workdayElementIsSource(input, fieldText)) return false
  if (workdayElementIsFormerEmployee(input, fieldText)) return false
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  const idBlob = compactIdBlob([
    input.id,
    input.getAttribute('name'),
    input.getAttribute('data-automation-id'),
    field?.getAttribute('data-automation-id'),
    field?.getAttribute('data-fkit-id'),
  ])
  if (
    idBlob.includes('linkedin') ||
    idBlob.includes('degree') ||
    idBlob.includes('fieldofstudy') ||
    idBlob.includes('major')
  ) {
    return false
  }
  if (idBlob.includes('school') || idBlob.includes('university') || idBlob.includes('college')) return true
  const label = `${fieldText} ${workdayChoiceQuestionText(input)}`.toLowerCase().replace(/[^a-z]/g, '')
  if (!label || label.includes('linkedin') || label.includes('degree') || label.includes('fieldofstudy')) return false
  return label.includes('school') || label.includes('university') || label.includes('college')
}

// Degree is the Canvas list next to School. Field of Study, LinkedIn, and the
// school prompt are different controls. A degree search box must not receive
// the raw profile string: typing "Bachelor of Science" into a list whose
// option is "Bachelors" clears a committed face back to Select One.
export function workdayElementIsDegree(input: Element, fieldText = ''): boolean {
  if (workdayElementIsPhoneDeviceType(input)) return false
  if (workdayElementIsSource(input, fieldText)) return false
  if (workdayElementIsFormerEmployee(input, fieldText)) return false
  if (workdayElementIsSchool(input, fieldText)) return false
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  const idBlob = compactIdBlob([
    input.id,
    input.getAttribute('name'),
    input.getAttribute('data-automation-id'),
    field?.getAttribute('data-automation-id'),
    field?.getAttribute('data-fkit-id'),
  ])
  if (
    idBlob.includes('fieldofstudy') ||
    idBlob.includes('major') ||
    idBlob.includes('linkedin') ||
    idBlob.includes('school') ||
    idBlob.includes('university') ||
    idBlob.includes('college')
  ) {
    return false
  }
  if (idBlob.includes('degree')) return true
  const label = `${fieldText} ${workdayChoiceQuestionText(input)}`.toLowerCase().replace(/[^a-z]/g, '')
  if (!label || label.includes('fieldofstudy') || label.includes('major') || label.includes('school')) return false
  return label.includes('degree')
}

// A prompt with no selected school is still empty when the input shows the
// profile name. Autofill has to open it again. A committed pill stays as it is.
export function workdaySchoolPromptNeedsFill(input: Element): boolean {
  if (!workdayElementIsSchool(input)) return false
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  if (!field) return false
  const backed = field.querySelector(
    '[data-automation-id="multiSelectContainer"], [data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"], [data-automation-id="selectedItemList"]',
  )
  if (!backed) return false
  const pills = field.querySelectorAll(
    '[data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"]',
  )
  for (const pill of Array.from(pills)) {
    const option = pill.querySelector('[data-automation-id="promptOption"]')
    const text = (
      option?.getAttribute('data-automation-label') ||
      option?.textContent ||
      pill.getAttribute('data-automation-label') ||
      pill.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
    if (text && text.toLowerCase() !== 'delete') return false
  }
  return true
}

export function workdayElementIsSource(input: Element, fieldText = ''): boolean {
  if (workdayElementIsPhoneDeviceType(input)) return false
  if (workdayIsSourceQuestion(fieldText) || workdayIsCustomSourceField(probeFrom(input))) return true
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  if (field && field !== input && workdayIsCustomSourceField(probeFrom(field))) return true
  return workdayIsSourceQuestion(workdayChoiceQuestionText(input))
}

export function workdayElementIsFormerEmployee(input: Element, fieldText = ''): boolean {
  if (workdayElementIsPhoneDeviceType(input)) return false
  if (workdayElementIsSource(input, fieldText)) return false
  if (workdayIsFormerEmployeeQuestion(fieldText)) return true
  return workdayIsFormerEmployeeQuestion(workdayChoiceQuestionText(input))
}

function optionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cleanOptionLabel(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

const PLACEHOLDER_OPTION_KEYS = new Set([
  '',
  'select',
  'select one',
  'please select',
  'choose',
  'choose one',
  'choose an option',
])

function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_OPTION_KEYS.has(key)
}

// "0 items selected" is the closed multi-select face, not a chosen source.
function isEmptyPromptKey(key: string): boolean {
  if (isPlaceholderKey(key)) return true
  return /^(?:0|no|none) items? selected$/.test(key)
}

// The multiselect search box always says Search. That hint is not a selection.
function isSearchPromptPlaceholder(value: string): boolean {
  const key = optionKey(value)
  return key === 'search' || key.startsWith('search ')
}

function isYesKey(key: string): boolean {
  return key === 'yes' || key.startsWith('yes ')
}

function isDeclineKey(key: string): boolean {
  return (
    key.includes('do not want') ||
    key.includes('do not wish') ||
    key.includes('dont want') ||
    key.includes('dont wish') ||
    key.includes('decline') ||
    key.includes('prefer not')
  )
}

// Exact "No", or a sentence that starts with No. Not Yes, and not a decline.
function isSafeNoKey(key: string): boolean {
  if (!key || isDeclineKey(key) || isYesKey(key)) return false
  if (key === 'no') return true
  return key.startsWith('no ')
}

function isReferralKey(key: string): boolean {
  return key.includes('referral') || key.includes('referred') || key.includes('recruiter')
}

function isKnowSomeoneKey(key: string): boolean {
  return key.includes('know someone') || key.includes('someone at')
}

function isSocialKey(key: string): boolean {
  if (key.includes('social media') || key.includes('social network')) return true
  return ['blind', 'github', 'instagram', 'twitter', 'youtube'].some((word) => hasOptionWord(key, word))
}

function isUniversityOrFairKey(key: string): boolean {
  return (
    key.includes('university') ||
    key.includes('career fair') ||
    key.includes('job fair') ||
    key.includes('campus') ||
    key.includes('conference') ||
    key.includes('networking')
  )
}

function isContingentKey(key: string): boolean {
  return key.includes('contingent')
}

// A leaf such as "Adobe.com" is the employer's own site. The company token comes
// from the career-site host, so the label is not a fixed string.
function isCompanySiteKey(key: string, company: string): boolean {
  const name = company.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!name || !key) return false
  if (
    isJobBoardKey(key) ||
    isReferralKey(key) ||
    isKnowSomeoneKey(key) ||
    isSocialKey(key) ||
    isUniversityOrFairKey(key) ||
    isContingentKey(key)
  ) {
    return false
  }
  return (
    key === `${name} com` ||
    key === `${name} org` ||
    key === `${name} net` ||
    key === `${name} io` ||
    key === `www ${name} com` ||
    key === `${name} website` ||
    key === `${name} site` ||
    key === `${name} web site`
  )
}

function hasOptionWord(key: string, word: string): boolean {
  return key === word || key.startsWith(`${word} `) || key.endsWith(` ${word}`) || key.includes(` ${word} `)
}

function isJobBoardKey(key: string): boolean {
  if (key.includes('job board') || key.includes('jobboard')) return true
  if (key.includes('career fair') || key.includes('job fair')) return true
  if (key.includes('careerbuilder') || key.includes('career builder')) return true
  return ['linkedin', 'indeed', 'glassdoor', 'monster', 'ziprecruiter', 'simplyhired', 'dice'].some((word) =>
    hasOptionWord(key, word),
  )
}

function isCompanyWebsite(key: string): boolean {
  const website = key.includes('website') || key.includes('web site')
  const owner =
    key.includes('company') || key.includes('employer') || key.includes('corporate') || key.includes('our ')
  if (website && owner) return true
  return key === 'company site' || key === 'corporate site' || key === 'our site' || key === 'our website'
}

function isCareerSite(key: string): boolean {
  return (
    key.includes('career site') ||
    key.includes('careers site') ||
    key.includes('career website') ||
    key.includes('careers website') ||
    key.includes('career page') ||
    key.includes('careers page') ||
    key.includes('career portal') ||
    key.includes('careers portal')
  )
}

// "Cisco Careers" / "Zillow Group Careers" — the tenant's own careers page.
function isOwnCareersPage(key: string): boolean {
  if (isJobBoardKey(key) || key.includes('fair')) return false
  if (/(^| )careers$/.test(key)) return true
  return key.includes('careers') && (key.includes('page') || key.includes('site') || key.includes('website'))
}

// The only How Did You Hear value. "Indeed.com" counts. A folder named Job Board does not.
function isIndeedOptionKey(key: string): boolean {
  return key === 'indeed' || key === 'indeed com'
}

// Job Board and Job Sites are the same folder. A job fair, Indeed, or LinkedIn is not that folder.
function isJobBoardFolderKey(key: string): boolean {
  if (!key || key.includes('fair')) return false
  if (key === 'indeed' || key === 'indeed com' || key === 'linkedin') return false
  return key === 'job board' || key === 'job boards' || key === 'jobboard' || key === 'job site' || key === 'job sites'
}

export function workdaySafeNoOption(optionTexts: string[]): string | null {
  const options = optionTexts.map(cleanOptionLabel).filter(Boolean)
  let exact: string | null = null
  let prefixed: string | null = null
  for (const text of options) {
    const key = optionKey(text)
    if (!isSafeNoKey(key)) continue
    if (key === 'no') exact = text
    else if (!prefixed || text.length < prefixed.length) prefixed = text
  }
  return exact || prefixed
}

// Indeed when that row is actually listed. Other, a company website, Adobe.com,
// a career site, Job Board, and No are not a How Did You Hear answer.
export function workdayIndeedSourceOption(optionTexts: string[]): string | null {
  if (workdayIsPhoneDeviceTypeOptionList(optionTexts)) return null
  for (const text of optionTexts) {
    const raw = cleanOptionLabel(text)
    if (raw && isIndeedOptionKey(optionKey(raw))) return raw
  }
  return null
}

// The Job Board / Job Sites parent. Opening it is not a committed value.
export function workdayJobBoardFolderOption(optionTexts: string[]): string | null {
  for (const text of optionTexts) {
    const raw = cleanOptionLabel(text)
    if (raw && isJobBoardFolderKey(optionKey(raw))) return raw
  }
  return null
}

export function workdayPreferredSourceOption(optionTexts: string[]): string | null {
  return workdayIndeedSourceOption(optionTexts)
}

export function workdaySourceOption(optionTexts: string[]): string | null {
  return workdayIndeedSourceOption(optionTexts)
}

// Other, then company website, career site, careers page, then the employer's
// own site (Adobe.com on an Adobe host). Job boards, social, university, fairs,
// contingent workers, referrals, and "know someone" are not a match.
function companyOwnedRank(key: string, company: string): number {
  if (!key || isPlaceholderKey(key) || isYesKey(key)) return 0
  if (
    isReferralKey(key) ||
    isKnowSomeoneKey(key) ||
    isSocialKey(key) ||
    isUniversityOrFairKey(key) ||
    isContingentKey(key) ||
    isJobBoardKey(key)
  ) {
    return 0
  }
  if (key === 'other' || key === 'other source') return 100
  if (key.startsWith('other') && !isJobBoardKey(key)) return 96
  if (isCompanyWebsite(key)) return 90
  if (isCareerSite(key)) return 80
  if (isOwnCareersPage(key)) return 70
  if (isCompanySiteKey(key, company)) return 68
  return 0
}

export function workdayCompanyToken(hostname: string): string {
  const host = hostname.toLowerCase().split(':')[0]
  if (!host.includes('myworkday')) return ''
  const first = host.split('.')[0] || ''
  if (
    !first ||
    first === 'www' ||
    /^wd\d+$/.test(first) ||
    first === 'myworkdayjobs' ||
    first === 'myworkday' ||
    first === 'myworkdaysite'
  ) {
    return ''
  }
  return first
}

export function workdayCompanyOwnedSourceOption(optionTexts: string[], companyToken: string): string | null {
  if (workdayIsPhoneDeviceTypeOptionList(optionTexts)) return null
  const company = companyToken.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const ranked = optionTexts
    .map((text, index) => ({ raw: cleanOptionLabel(text), index }))
    .filter((option) => option.raw)
    .map((option) => ({ ...option, rank: companyOwnedRank(optionKey(option.raw), company) }))
    .filter((option) => option.rank >= 68)
  if (ranked.length === 0) return null
  ranked.sort((a, b) => b.rank - a.rank || a.index - b.index)
  return ranked[0].raw
}

const FOLDER_MARKER =
  '.wd-icon-chevron-right, .wd-icon-chevron-left, .wd-icon-chevron-right-small, .wd-icon-chevron-left-small, [data-automation-id="promptOptionMore"]'

// A nested source row is a folder. Workday paints a chevron when the row is not
// selectable. Clicking it opens children; it does not commit a value.
export function workdayPromptRowIsFolder(element: HTMLElement): boolean {
  const row =
    (element.closest(
      '[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]',
    ) as HTMLElement | null) || element
  if (row.querySelector('[data-automation-id="radioBtn"], [data-automation-id="checkbox"]')) return false
  if (row.matches(FOLDER_MARKER) || !!row.querySelector(FOLDER_MARKER)) return true
  const popup = row.getAttribute('aria-haspopup')
  if (popup && popup !== 'false') return true
  if (row.hasAttribute('aria-expanded')) return true
  return false
}

export function workdayFolderOptions(root: ParentNode): Array<{ label: string; element: HTMLElement }> {
  return workdayOptionElements(root).filter((choice) => workdayPromptRowIsFolder(choice.element))
}

function choiceQuestionParts(control: Element): string[] {
  const parts: string[] = []
  const push = (value: string | null | undefined) => {
    const text = cleanOptionLabel(value || '')
    if (text) parts.push(text)
  }
  push(control.getAttribute('aria-label'))
  push(control.getAttribute('name'))
  push(control.id)
  push(control.getAttribute('data-automation-id'))
  const doc = control.ownerDocument
  const labelledBy = control.getAttribute('aria-labelledby') || ''
  if (doc && labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      if (id) push(doc.getElementById(id)?.textContent)
    }
  }
  const field =
    control.closest('[data-automation-id^="formField-"]') ||
    control.closest('[data-fkit-id]') ||
    control.closest('fieldset')
  if (field) {
    push(field.getAttribute('data-automation-id'))
    push(field.getAttribute('data-fkit-id'))
    const label = Array.from(field.children).find(
      (child) => (child.tagName === 'LABEL' || child.tagName === 'LEGEND') && !child.contains(control),
    )
    push((label || field.querySelector('label, legend'))?.textContent)
  }
  return parts
}

function workdayChoiceQuestionText(control: Element): string {
  return choiceQuestionParts(control).join(' ')
}

function elementLooksLikeSource(button: HTMLButtonElement): boolean {
  if (workdayElementIsPhoneDeviceType(button)) return false
  if (workdayIsCustomSourceField(probeFrom(button)) || workdayIsSourceQuestion(workdayChoiceQuestionText(button))) {
    return true
  }
  const field = button.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  return !!field && field !== button && workdayIsCustomSourceField(probeFrom(field))
}

function isAddressOrPhoneChoice(button: HTMLButtonElement): boolean {
  if (workdayElementIsPhoneDeviceType(button)) return true
  const field = button.closest('[data-automation-id], [data-fkit-id]')
  const blob = [
    button.getAttribute('name') || '',
    button.id || '',
    button.getAttribute('data-automation-id') || '',
    field?.getAttribute('data-automation-id') || '',
    field?.getAttribute('data-fkit-id') || '',
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (blob.includes('phonedevicetype') || blob.includes('phonetype') || blob.includes('countryphonecode')) return true
  if (blob.includes('countryregion') || blob.includes('country')) return true
  return false
}

function findMyInfoChoiceButton(
  root: ParentNode,
  pred: (button: HTMLButtonElement) => boolean,
): HTMLButtonElement | null {
  const nodes = root.querySelectorAll('button[aria-haspopup="listbox"]')
  for (const node of Array.from(nodes)) {
    if (node.tagName !== 'BUTTON') continue
    const button = node as HTMLButtonElement
    if (pred(button)) return button
  }
  return null
}

export function workdaySourceListboxButton(root: ParentNode): HTMLButtonElement | null {
  const named = workdayListboxButton(root, 'source')
  if (named && elementLooksLikeSource(named) && !isAddressOrPhoneChoice(named)) return named
  return findMyInfoChoiceButton(root, (button) => !isAddressOrPhoneChoice(button) && elementLooksLikeSource(button))
}

export function workdayFormerEmployeeListboxButton(root: ParentNode): HTMLButtonElement | null {
  return findMyInfoChoiceButton(root, (button) => {
    if (isAddressOrPhoneChoice(button) || elementLooksLikeSource(button)) return false
    return workdayIsFormerEmployeeQuestion(workdayChoiceQuestionText(button))
  })
}

// SelectField's accessible name is the question, then the selected answer
// ("…requisition? Yes"), not the bare word. A required marker can follow the
// answer. The closed control has the profile answer when Yes or No is its own word.
export function workdayClosedLabelShowsAnswer(shown: string, answer: 'yes' | 'no'): boolean {
  const key = shown.toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  if (!key || isPlaceholderKey(key)) return false
  const tokens = key.split(' ')
  if (answer === 'yes') return tokens.includes('yes')
  return tokens.includes('no')
}

export function workdayButtonShowsAnswer(button: HTMLElement, answer: 'yes' | 'no'): boolean {
  if (workdayClosedLabelShowsAnswer(workdayListboxValue(button), answer)) return true
  return workdayClosedLabelShowsAnswer(button.getAttribute('aria-label') || '', answer)
}

export function workdayListboxIsEmpty(button: HTMLElement): boolean {
  const shown = workdayListboxValue(button)
  const key = optionKey(shown)
  if (isEmptyPromptKey(key)) {
    const aria = button.getAttribute('aria-label') || ''
    if (workdayClosedLabelShowsAnswer(aria, 'yes') || workdayClosedLabelShowsAnswer(aria, 'no')) return false
    return true
  }
  if (workdayClosedLabelShowsAnswer(shown, 'yes') || workdayClosedLabelShowsAnswer(shown, 'no')) return false
  const question = optionKey(workdayChoiceQuestionText(button))
  return !!question && key === question
}

// A custom source input can show the empty face in its value, a selection
// placeholder, or promptAriaInstruction ("0 items selected"). The search box
// placeholder "Search" is not a selection. A pill or "1 item selected" is.
export function workdayPromptFaceIsEmpty(control: HTMLElement): boolean {
  const faces: string[] = []
  if (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') {
    const field = control as HTMLInputElement
    faces.push(field.value || '')
    const placeholder = field.getAttribute('placeholder') || ''
    if (!isSearchPromptPlaceholder(placeholder)) faces.push(placeholder)
  }
  faces.push(workdayListboxValue(control))
  const scope = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  if (scope && scope !== control) {
    const instruction = scope.querySelector('[data-automation-id="promptAriaInstruction"]')
    if (instruction && !control.contains(instruction)) faces.push(instruction.textContent || '')
    scope
      .querySelectorAll(
        '[data-automation-id="promptSelectionLabel"], [data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"]',
      )
      .forEach((node) => {
        if (!control.contains(node)) faces.push(node.textContent || '')
      })
  }
  const shown = faces
    .map((value) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (shown.length === 0) return true
  return shown.every((value) => isEmptyPromptKey(optionKey(value)))
}

export function workdayDisabilityOptionIndex(labels: string[], status: string): number {
  const want = status.trim().toLowerCase()
  const norms = labels.map((label) => label.toLowerCase().replace(/\s+/g, ' ').trim())
  if (want === 'yes') {
    return norms.findIndex(
      (label) => /\byes\b/.test(label) || (label.includes('have a disability') && !label.includes('do not')),
    )
  }
  if (want === 'no') {
    return norms.findIndex(
      (label) =>
        (label.startsWith('no') || label.includes('do not have')) &&
        !label.includes('do not want') &&
        !label.includes('not wish'),
    )
  }
  if (want === 'decline') {
    return norms.findIndex(
      (label) =>
        label.includes('do not want') ||
        label.includes("don't want") ||
        label.includes('do not wish') ||
        label.includes('decline'),
    )
  }
  return -1
}

export function workdayExperienceLocation(city?: string | null, state?: string | null): string {
  return [city, state]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ')
}
