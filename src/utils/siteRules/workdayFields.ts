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

// Account creation renders email + password + verifyPassword together.
// My Information's email control is emailAddress and must not count.
export function workdayJobApplyButton(root: ParentNode): HTMLElement | null {
  if (root.querySelector('[data-automation-id="applyManually"]')) return null
  const buttons = root.querySelectorAll('[data-automation-id="adventureButton"]')
  for (const button of Array.from(buttons)) {
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (text === 'apply') return button as HTMLElement
  }
  return null
}

export function isWorkdayAccountCreationForm(root: ParentNode): boolean {
  return !!(
    root.querySelector('[data-automation-id="email"]') &&
    root.querySelector('[data-automation-id="password"]') &&
    root.querySelector('[data-automation-id="verifyPassword"]')
  )
}

// Create Account's visible target is often a click_filter wrapping
// createAccountSubmitButton. Other Workday buttons use click_filter too
// (including Next). Only the filter tied to this submit control is safe.
export function workdayAccountSubmitControl(root: ParentNode): HTMLElement | null {
  const submit = root.querySelector('[data-automation-id="createAccountSubmitButton"]')
  if (!submit) return null
  const wrapping = submit.closest('[data-automation-id="click_filter"]')
  if (wrapping) return wrapping as HTMLElement
  const nested = submit.querySelector('[data-automation-id="click_filter"]')
  if (nested) return nested as HTMLElement
  const parent = submit.parentElement
  const sibling = parent?.querySelector(':scope > [data-automation-id="click_filter"]')
  if (sibling) return sibling as HTMLElement
  return submit as HTMLElement
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

export function workdayFieldControl(root: ParentNode, metadataId: string): Element | null {
  const wrapped = root.querySelector(
    `[data-automation-id="formField-${metadataId}"] input, [data-automation-id="formField-${metadataId}"] textarea`,
  )
  if (wrapped) return wrapped
  const direct = root.querySelector(`[data-automation-id="${metadataId}"]`)
  if (direct && (direct.tagName === 'INPUT' || direct.tagName === 'TEXTAREA')) return direct
  const byPath = root.querySelector(`[data-fkit-id$="--${metadataId}"], [data-fkit-id="${metadataId}"]`)
  if (!byPath) return null
  if (byPath.tagName === 'INPUT' || byPath.tagName === 'TEXTAREA') return byPath
  return byPath.querySelector('input, textarea')
}

export function workdayListboxButton(root: ParentNode, metadataId: string): HTMLButtonElement | null {
  const button = root.querySelector(
    [
      `button[name="${metadataId}"]`,
      `[data-automation-id="formField-${metadataId}"] button[aria-haspopup="listbox"]`,
      `[data-fkit-id="${metadataId}"] button[aria-haspopup="listbox"]`,
      `[data-fkit-id$="--${metadataId}"] button[aria-haspopup="listbox"]`,
      `button[id$="${metadataId}"][aria-haspopup="listbox"]`,
    ].join(', '),
  )
  if (!button || button.tagName !== 'BUTTON') return null
  return button as HTMLButtonElement
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

export function matchingOptionText(
  optionTexts: string[],
  desired: string,
  kind: 'state' | 'country',
): string | null {
  const want = desired.trim().toLowerCase()
  if (!want) return null
  const exact = optionTexts.find((text) => text.trim().toLowerCase() === want)
  if (exact) return exact
  const group = RELATIVE_MATCHES[kind].find((aliases) => aliases.some((alias) => alias.toLowerCase() === want))
  if (!group) return null
  const hits = optionTexts.filter((text) =>
    group.some((alias) => alias.toLowerCase() === text.trim().toLowerCase()),
  )
  if (hits.length === 0) return null
  hits.sort((a, b) => b.trim().length - a.trim().length)
  return hits[0]
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

export function workdayPhoneTypeOption(optionTexts: string[]): string | null {
  const options = optionTexts.map((text) => text.trim()).filter(Boolean)
  for (const want of ['mobile', 'cell', 'cellular']) {
    const exact = options.find((text) => text.toLowerCase() === want)
    if (exact) return exact
  }
  return (
    options.find((text) => /mobile|cell/i.test(text) && !/work|home|fax/i.test(text)) || null
  )
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
