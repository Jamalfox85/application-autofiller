import { RELATIVE_MATCHES } from '../relativeMatches.ts'

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

// Account creation renders email + password + verifyPassword together.
// Cisco and Zillow put those automation ids on the inputs. Salesforce puts
// formField-* wrappers around the inputs and may omit the bare ids. My
// Information's email control is emailAddress and must not count.
export function isWorkdayAccountCreationForm(root: ParentNode): boolean {
  const fields = workdayAccountInputs(root)
  return !!(fields.email && fields.password && fields.verifyPassword)
}

// Cisco Apply Manually lands on Create Account with no SignInWithEmailButton.
// Skip the sign-in click when that control is absent, and also once the account
// form is already on the page. Salesforce's signInLink and Zillow's signInLink
// plus utilityButtonSignIn must not pull us off Create Account.
export function workdaySignInWithEmailButton(root: ParentNode): HTMLElement | null {
  if (isWorkdayAccountCreationForm(root)) return null
  return root.querySelector(
    `${WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR}, ${WORKDAY_SIGN_IN_LINK_SELECTOR}`,
  ) as HTMLElement | null
}

export function workdayCreateAccountLink(root: ParentNode): HTMLElement | null {
  if (isWorkdayAccountCreationForm(root)) return null
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

function workdayAccountInput(root: ParentNode, metadataId: string): HTMLInputElement | null {
  const control = workdayFieldControl(root, metadataId)
  if (!control || control.tagName !== 'INPUT') return null
  return control as HTMLInputElement
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

export function workdayPhoneDeviceTypeButton(root: ParentNode): HTMLButtonElement | null {
  for (const id of PHONE_DEVICE_TYPE_IDS) {
    const button = workdayListboxButton(root, id)
    if (button) return button
  }
  const buttons = root.querySelectorAll('button')
  for (const button of Array.from(buttons)) {
    const name = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.replace(/\s+/g, ' ').toLowerCase()
    if (name.includes('phone device type') || name.includes('device type')) return button as HTMLButtonElement
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
// option that is still in the document (Georgia is both).
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
  ).filter((node) => !button.contains(node))
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
  const nodes = Array.from(root.querySelectorAll(PROMPT_OPTION_SELECTOR))
  const choices: Array<{ label: string; element: HTMLElement }> = []
  for (const node of nodes) {
    if (node.querySelector(PROMPT_OPTION_SELECTOR)) continue
    const label = promptOptionLabel(node)
    if (!label) continue
    choices.push({ label, element: node as HTMLElement })
  }
  return choices
}

export function workdayOptionLabels(root: ParentNode): string[] {
  return workdayOptionElements(root).map((choice) => choice.label)
}

export function workdayOptionElement(root: ParentNode, label: string): HTMLElement | null {
  const want = normalizeListedKey(label)
  if (!want) return null
  return workdayOptionElements(root).find((choice) => normalizeListedKey(choice.label) === want)?.element || null
}

export function workdayPromptSearchInput(root: ParentNode): HTMLInputElement | null {
  const input = root.querySelector(
    'input[data-automation-id="searchBox"], input[data-automation-id="promptSearchInput"], input[data-automation-id="monikerSearchBox"]',
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

export type WorkdaySelectKind = 'country' | 'state' | 'phone'

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
  const label =
    kind === 'phone'
      ? workdayPhoneTypeOption(options.map((option) => option.text))
      : matchingOptionText(
          options.map((option) => option.text),
          desired,
          kind,
        )
  if (!label) return null
  const want = normalizeListedKey(label)
  const match = options.find((option) => normalizeListedKey(option.text) === want)
  return match ? match.value : null
}

// "How did you hear" and former-employee / email-id questions have no vault field.
// Claim them so generic fill cannot invent Job Board, LinkedIn, Yes, or No.
export function workdayIsFormerEmployeeQuestion(fieldText: string): boolean {
  const compact = fieldText.toLowerCase().replace(/[^a-z]/g, '')
  if (!compact) return false
  if (
    compact.includes('formeremployee') ||
    compact.includes('previouslyemployed') ||
    compact.includes('previousemployee') ||
    compact.includes('ciscoemployee')
  ) {
    return true
  }
  return compact.includes('employee') && compact.includes('emailid')
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
