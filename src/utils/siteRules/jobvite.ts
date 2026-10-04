import type { PersonalInfo, SiteRule } from '../../types/index.ts'
import { detectAts, type AtsPageContext } from '../ats.ts'
import { setReactInputValue } from '../inputHandlers.ts'
import { loadResumeFileForJobvite } from '../savedResumeFile.ts'
import {
  jobvitePlan,
  jobviteRepeatKey,
  type JobviteField,
  type JobvitePlan,
  type JobviteRepeatKey,
  type JobviteSection,
} from './jobviteFields.ts'

export type JobviteResumeLoader = (info: PersonalInfo) => Promise<File | null>

// Hosted Jobvite apply pages (jobs.jobvite.com/{company}/job/{id} and /apply, plus the
// older /careers/{company}/job/{id}/apply path). Custom-domain embeds are out of scope:
// the content script fills the frame whose hostname is jobvite.com. app.jobvite.com is
// the candidate tracker; this rule writes the apply form, plus the resume file
// input Jobvite compiles into the Add Resume menu on document.body.

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

export default function jobviteConfig(deps?: { loadResume?: JobviteResumeLoader }): SiteRule {
  const loadResume = deps?.loadResume ?? loadResumeFileForJobvite
  return {
    detect: () => isHostedJobvitePage(),
    apply: async (input, _fieldText, personalInfo) => {
      // The Add Resume file input is compiled onto document.body, outside .jv-apply-form.
      if (!jobviteOwnsControl(input)) return false
      const field = describeJobviteField(input)
      const repeatKey = jobviteRepeatKey(field)
      const index = repeatKey ? repeatIndex(input, repeatKey) : 0
      const plan = jobvitePlan(field, personalInfo, index, { now: new Date() })
      // Recognized and left blank: custom questions, cover letter, autofill-with-resume,
      // unmatched radios. 'skip' keeps the generic matcher from inventing an answer.
      if (plan.action === 'skip') return 'skip'
      if (plan.action === 'attachResume') {
        if (controlType(input) !== 'file') return 'skip'
        return attachSavedResume(input as HTMLInputElement, personalInfo, loadResume)
      }
      if (!insideJobviteApply(input)) return 'skip'
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

function jobviteOwnsControl(input: HTMLElement): boolean {
  if (insideJobviteApply(input)) return true
  if (controlType(input) !== 'file') return false
  return !!input.closest('.jv-add-attachment, #attachResume')
}

function countJobviteFillable(): number {
  if (typeof document === 'undefined') return 0
  const form = document.querySelector('.jv-apply-form')
  const formCount = form ? form.querySelectorAll('input, textarea, select').length : 0
  // jv-file-input inserts the choose-file control into the attachment menu on
  // document.body, not inside the apply form. A refill should see it arrive.
  const widgetFiles = document.querySelectorAll('.jv-add-attachment input[type="file"]').length
  return formCount + widgetFiles
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
    context: fileWidgetContext(input),
  }
}

// The File item and the Paste prompt share one menu. Keep the prompt (it names
// Resume vs Cover Letter) and drop LinkedIn / Dropbox, which are separate actions.
function fileWidgetContext(input: HTMLElement): string {
  const dropdown = input.closest('.jv-add-attachment')
  if (dropdown) {
    const prompt = Array.from(dropdown.querySelectorAll('.jv-visually-hidden'))
      .map((node) => cleanLabel(node.textContent))
      .filter(Boolean)
      .join(' ')
    return cleanLabel(`${dropdown.getAttribute('attachment-label') || ''} ${prompt}`)
  }
  const section = input.closest('#attachResume')
  if (!section) return ''
  const header = section.querySelector('#jv-resume-header, .jv-step-header')
  const labeled = section.querySelector('[attachment-label]')
  return cleanLabel(`${header?.textContent || ''} ${labeled?.getAttribute('attachment-label') || ''}`)
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

async function attachSavedResume(
  input: HTMLInputElement,
  info: PersonalInfo,
  loadResume: JobviteResumeLoader,
): Promise<boolean | 'skip'> {
  let file: File | null
  try {
    file = await loadResume(info)
  } catch (error) {
    console.error('[jobvite] could not read the saved resume', error)
    return 'skip'
  }
  if (!file) return 'skip'
  return assignResumeFile(input, file) ? true : 'skip'
}

// Chrome lets an extension assign input.files from a DataTransfer. Dispatching
// change is what Jobvite's jv-file-input reads (an onchange attribute). Do not
// click the input — that opens the system file chooser.
export function assignResumeFile(input: HTMLInputElement, file: File): boolean {
  const view = input.ownerDocument?.defaultView
  const DataTransferCtor = view?.DataTransfer
  if (typeof DataTransferCtor !== 'function') return false
  let transfer: DataTransfer
  try {
    transfer = new DataTransferCtor()
    transfer.items.add(file)
    input.files = transfer.files
  } catch {
    return false
  }
  const attached = input.files?.[0]
  if (!attached || attached.name !== file.name) return false
  const EventCtor = view?.Event ?? Event
  input.dispatchEvent(new EventCtor('input', { bubbles: true }))
  input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return true
}

function writeJobvitePlan(
  input: HTMLElement,
  plan: Exclude<JobvitePlan, { action: 'skip' } | { action: 'attachResume' }>,
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
