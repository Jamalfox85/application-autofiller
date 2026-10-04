import type { SiteRule } from '../../types/index.ts'
import { detectAts, type AtsPageContext } from '../ats.ts'
import { setReactInputValue } from '../inputHandlers.ts'
import {
  jobvitePlan,
  jobviteRepeatKey,
  type JobviteField,
  type JobvitePlan,
  type JobviteRepeatKey,
  type JobviteSection,
} from './jobviteFields.ts'

// Hosted Jobvite apply pages (jobs.jobvite.com/{company}/job/{id} and /apply, plus the
// older /careers/{company}/job/{id}/apply path). Custom-domain embeds are out of scope:
// the content script fills the frame whose hostname is jobvite.com. app.jobvite.com is
// the candidate tracker; this rule only writes inside the apply form.

const APPLY_ROOT =
  '.jv-apply-form, .jv-form-field, .jv-ofccp-section, .jv-prescreen-section, #attachResume'

export function isHostedJobvitePage(input?: AtsPageContext): boolean {
  const page: AtsPageContext = input ?? {
    hostname: window.location.hostname,
    href: window.location.href,
    document,
  }
  return detectAts(page) === 'jobvite'
}

// Lazy. Counting at import would throw when this module loads before `document`
// exists, which takes down the content script.
let seenFillableCount: number | null = null

export function resetJobviteFormWatch() {
  seenFillableCount = null
}

export default function jobviteConfig(): SiteRule {
  return {
    detect: () => isHostedJobvitePage(),
    apply: (input, _fieldText, personalInfo) => {
      if (!insideJobviteApply(input)) return false
      const field = describeJobviteField(input)
      const repeatKey = jobviteRepeatKey(field)
      const index = repeatKey ? repeatIndex(input, repeatKey) : 0
      const plan = jobvitePlan(field, personalInfo, index, { now: new Date() })
      // Recognized and left blank: custom questions, resume files, unmatched radios.
      // 'skip' keeps the generic matcher from inventing an answer.
      if (plan.action === 'skip') return 'skip'
      return writeJobvitePlan(input, plan) ? true : 'skip'
    },
    // Step 2 (EEO / OFCCP) and step 3 (prescreen) are ng-if'd in after the person
    // clicks Next. Refill when the apply form gains controls. Never click Next,
    // Send Application, or Submit.
    formChanged: () => {
      const count = countJobviteFillable()
      if (seenFillableCount == null) {
        seenFillableCount = count
        return false
      }
      if (count > seenFillableCount) {
        seenFillableCount = count
        return true
      }
      return false
    },
  }
}

function insideJobviteApply(input: HTMLElement): boolean {
  return !!input.closest(APPLY_ROOT)
}

function countJobviteFillable(): number {
  if (typeof document === 'undefined') return 0
  const form = document.querySelector('.jv-apply-form')
  if (!form) return 0
  return form.querySelectorAll('input, textarea, select').length
}

function controlType(input: HTMLElement): string {
  if (input.tagName === 'TEXTAREA') return 'textarea'
  if (input.tagName === 'SELECT') return 'select-one'
  return ((input as HTMLInputElement).type || 'text').toLowerCase()
}

function cleanLabel(value: string | null | undefined): string {
  return (value || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

export function describeJobviteField(input: HTMLElement): JobviteField {
  const type = controlType(input)
  const select = input.tagName === 'SELECT' ? (input as HTMLSelectElement) : null
  return {
    label: questionLabel(input),
    optionLabel: optionLabel(input, type),
    type,
    autocomplete: input.getAttribute('autocomplete'),
    section: sectionOf(input),
    options: select
      ? Array.from(select.options).map((option) => ({
          text: option.textContent || option.label || '',
          value: option.value,
        }))
      : [],
  }
}

function questionLabel(input: HTMLElement): string {
  const root = input.closest('.jv-form-field') || input.closest('fieldset')
  const type = controlType(input)
  if (root && (type === 'radio' || type === 'checkbox')) {
    const legend = root.querySelector('.jv-form-field-legend, legend')
    const legendText = cleanLabel(legend?.textContent)
    if (legendText) return legendText
  }
  const label = root?.querySelector('.jv-form-field-label')
  const labelText = cleanLabel(label?.textContent)
  if (labelText) return labelText
  return labelForControl(input)
}

function optionLabel(input: HTMLElement, type: string): string {
  if (type !== 'radio' && type !== 'checkbox') return ''
  const row = input.closest('.jv-input-group-row, label')
  return cleanLabel(row?.textContent)
}

function labelForControl(input: HTMLElement): string {
  const id = input.id
  if (!id || !input.ownerDocument) return ''
  const escaped = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const label = input.ownerDocument.querySelector(`label[for="${escaped}"]`)
  return cleanLabel(label?.textContent)
}

function sectionOf(input: HTMLElement): JobviteSection {
  let node: HTMLElement | null = input
  while (node) {
    const model = (node.getAttribute('ng-model') || '').toLowerCase()
    if (model.includes('ofccp')) return 'ofccp'
    if (model.includes('prescreen')) return 'prescreen'
    if (model.includes('eeo')) return 'eeo'
    if (node.classList.contains('jv-ofccp-section')) return 'ofccp'
    if (node.classList.contains('jv-prescreen-section')) return 'prescreen'
    if (node.classList.contains('jv-eeo-section')) return 'eeo'
    if (node.classList.contains('jv-apply-form')) break
    node = node.parentElement
  }
  return 'apply'
}

function repeatIndex(input: HTMLElement, key: JobviteRepeatKey): number {
  const form = input.closest('.jv-apply-form')
  const root: ParentNode = form || input.ownerDocument
  if (!root) return 0
  let count = 0
  for (const node of root.querySelectorAll('input, textarea, select')) {
    if (node === input) break
    const el = node as HTMLElement
    if (!insideJobviteApply(el)) continue
    if (jobviteRepeatKey(describeJobviteField(el)) === key) count++
  }
  return count
}

function writeJobvitePlan(
  input: HTMLElement,
  plan: Exclude<JobvitePlan, { action: 'skip' }>,
): boolean {
  if (plan.action === 'click') {
    const type = controlType(input)
    if (type !== 'radio' && type !== 'checkbox') return false
    clickChoice(input as HTMLInputElement)
    return true
  }
  if (plan.action === 'select') {
    if (input.tagName !== 'SELECT') return false
    return commitSelect(input as HTMLSelectElement, plan.optionText)
  }
  const type = controlType(input)
  if (
    input.tagName === 'SELECT' ||
    type === 'radio' ||
    type === 'checkbox' ||
    type === 'file' ||
    type === 'hidden' ||
    type === 'password' ||
    type === 'button' ||
    type === 'submit'
  ) {
    return false
  }
  setReactInputValue(input as HTMLInputElement, plan.value)
  dispatch(input, 'change')
  dispatch(input, 'blur')
  return true
}

function clickChoice(input: HTMLInputElement) {
  if (!input.checked) input.click()
  dispatch(input, 'input')
  dispatch(input, 'change')
}

function commitSelect(select: HTMLSelectElement, optionText: string): boolean {
  const wanted = optionText.replace(/\s+/g, ' ').trim().toLowerCase()
  const match = Array.from(select.options).find((option) => {
    const text = (option.textContent || option.label || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    const value = (option.value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    return text === wanted || value === wanted
  })
  if (!match) return false
  select.value = match.value
  dispatch(select, 'input')
  dispatch(select, 'change')
  return true
}

function dispatch(el: HTMLElement, type: string) {
  const EventCtor = el.ownerDocument?.defaultView?.Event ?? Event
  el.dispatchEvent(new EventCtor(type, { bubbles: true }))
}
