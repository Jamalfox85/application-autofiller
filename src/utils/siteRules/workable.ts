import type { SiteRule } from '../../types/index.ts'
import {
  documentHasWorkableForm,
  isWorkableApplyHost,
  type AtsPageContext,
} from '../ats.ts'
import { setReactInputValue } from '../inputHandlers.ts'
import {
  compareWorkableFill,
  isWorkableAdvanceControl,
  workableFieldKey,
  workableMaySubmit,
  workablePhase,
  workablePlan,
  workableQuestionLabel,
  type WorkableField,
  type WorkableGroup,
  type WorkablePlan,
} from './workableFields.ts'

// Hosted apply.workable.com pages, and the same application / EEO form when a
// custom domain serves the Workable careers shell. An iframe on a parent page
// is filled by the frame whose host is apply.workable.com. #whr_embed_hook is
// a job list and is not a fill root.

const FORM_ROOT = '[data-ui="application-form"], [data-ui="eeoc-form"]'

export function isWorkableApplyPage(input?: AtsPageContext): boolean {
  const page: AtsPageContext = input ?? {
    hostname: typeof window === 'undefined' ? '' : window.location.hostname,
    href: typeof window === 'undefined' ? '' : window.location.href,
    document: typeof document === 'undefined' ? null : document,
  }
  if (isWorkableApplyHost(page.hostname)) return true
  if (page.document && documentHasWorkableForm(page.document)) return true
  return false
}

// Lazy. Counting at import would throw when this module loads before `document`
// exists, which takes down the content script.
let seenFillableCount: number | null = null
let fillGeneration = 0
let completedGeneration = -1
const outcomes = new WeakMap<HTMLElement, { generation: number; result: true | 'skip' }>()

export function resetWorkableFormWatch() {
  seenFillableCount = null
  fillGeneration = 0
  completedGeneration = -1
}

export default function workableConfig(): SiteRule {
  return {
    detect: () => (typeof window === 'undefined' ? false : isWorkableApplyPage()),
    prepareFill: () => {
      fillGeneration += 1
    },
    apply: (input, _fieldText, personalInfo) => {
      if (!insideWorkableForm(input)) return false
      const doc = input.ownerDocument
      if (doc) fillWorkableDocument(doc, personalInfo)
      const hit = outcomes.get(input)
      if (hit && hit.generation === fillGeneration) return hit.result
      const field = describeWorkableField(input)
      const plan = workablePlan(field, personalInfo, rowIndex(input, field.group))
      if (plan.action === 'skip') return 'skip'
      return writeWorkablePlan(input, plan) ? true : 'skip'
    },
    // Education and experience editors appear after Add. Refill when the form
    // gains controls. Never click Submit application or the EEO submit/skip buttons.
    formChanged: () => {
      const count = countWorkableFillable()
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

function fillWorkableDocument(doc: Document, personalInfo: Parameters<typeof workablePlan>[1]) {
  if (completedGeneration === fillGeneration) return
  completedGeneration = fillGeneration
  const maySubmit: boolean = workableMaySubmit()
  if (maySubmit) return

  const items: Array<{ input: HTMLElement; field: WorkableField; row: number; order: number }> = []
  const forms = doc.querySelectorAll(FORM_ROOT)
  let order = 0
  for (let i = 0; i < forms.length; i++) {
    const controls = forms[i].querySelectorAll('input, textarea, select')
    for (let j = 0; j < controls.length; j++) {
      const input = controls[j] as HTMLElement
      const field = describeWorkableField(input)
      items.push({ input, field, row: rowIndex(input, field.group), order })
      order += 1
    }
  }
  items.sort(compareWorkableFill)

  let revealedExperience = false
  let revealedEducation = false
  const reveal = (nextPhase: ReturnType<typeof workablePhase> | 'end') => {
    const next = nextPhase === 'end' ? WORKABLE_PHASE_END : phaseRank(nextPhase)
    if (!revealedExperience && next > phaseRank('experience')) {
      revealedExperience = true
      clickAddSection(doc, 'experience', personalInfo.experience?.length ?? 0)
    }
    if (!revealedEducation && next > phaseRank('education')) {
      revealedEducation = true
      clickAddSection(doc, 'education', personalInfo.education?.length ?? 0)
    }
  }

  for (const item of items) {
    reveal(workablePhase(item.field))
    const plan = workablePlan(item.field, personalInfo, item.row)
    const result: true | 'skip' =
      plan.action === 'skip' ? 'skip' : writeWorkablePlan(item.input, plan) ? true : 'skip'
    outcomes.set(item.input, { generation: fillGeneration, result })
  }
  reveal('end')
}

const WORKABLE_PHASE_END = 99

function phaseRank(phase: ReturnType<typeof workablePhase>): number {
  if (phase === 'contact') return 0
  if (phase === 'resume') return 1
  if (phase === 'experience') return 2
  if (phase === 'education') return 3
  if (phase === 'work-authorization') return 4
  if (phase === 'eeo') return 5
  return 6
}

function clickAddSection(
  doc: Document,
  group: 'education' | 'experience',
  profileRows: number,
) {
  if (profileRows <= 0) return
  if (editorCount(doc, group) >= profileRows) return
  const section = doc.querySelector(`[data-ui="application-form"] [data-ui="${group}"]`)
  const button = section?.querySelector('button[data-ui="add-section"]')
  if (!button || button.tagName !== 'BUTTON') return
  const control = button as HTMLButtonElement
  if (control.disabled) return
  if (
    isWorkableAdvanceControl({
      dataUi: control.getAttribute('data-ui'),
      type: control.type,
    })
  ) {
    return
  }
  control.click()
}

function editorCount(doc: Document, group: 'education' | 'experience'): number {
  const section = doc.querySelector(`[data-ui="application-form"] [data-ui="${group}"]`)
  if (!section) return 0
  return section.querySelectorAll('[data-ui="editor"]').length
}

function insideWorkableForm(input: HTMLElement): boolean {
  return !!input.closest(FORM_ROOT)
}

function countWorkableFillable(): number {
  if (typeof document === 'undefined' || !document.querySelectorAll) return 0
  try {
    const forms = document.querySelectorAll(FORM_ROOT)
    let total = 0
    for (let i = 0; i < forms.length; i++) {
      total += forms[i].querySelectorAll('input, textarea, select').length
    }
    return total
  } catch {
    return 0
  }
}

function controlType(input: HTMLElement): string {
  if (input.tagName === 'TEXTAREA') return 'textarea'
  if (input.tagName === 'SELECT') return 'select-one'
  return ((input as HTMLInputElement).type || 'text').toLowerCase()
}

function cleanLabel(value: string | null | undefined): string {
  return (value || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

export function describeWorkableField(input: HTMLElement): WorkableField {
  const group = groupOf(input)
  return {
    dataUi: input.getAttribute('data-ui'),
    name: input.getAttribute('name'),
    id: input.getAttribute('id'),
    type: controlType(input),
    label: questionText(input),
    optionValue: (input as HTMLInputElement).value || input.getAttribute('value'),
    optionLabel: optionLabel(input),
    group,
    hidden: isHiddenLocation(input, group),
    placeholder: input.getAttribute('placeholder'),
  }
}

function groupOf(input: HTMLElement): WorkableGroup {
  if (input.closest('[data-ui="eeoc-form"]')) return 'eeo'
  if (input.closest('[data-ui="education"]')) return 'education'
  if (input.closest('[data-ui="experience"]')) return 'experience'
  return 'application'
}

function rowIndex(input: HTMLElement, group: WorkableGroup | null | undefined): number {
  if (group !== 'education' && group !== 'experience') return 0
  const section = input.closest(`[data-ui="${group}"]`)
  const editor = input.closest('[data-ui="editor"]')
  if (!section || !editor) return -1
  const editors = section.querySelectorAll('[data-ui="editor"]')
  for (let i = 0; i < editors.length; i++) {
    if (editors[i] === editor) return i
  }
  return -1
}

function isHiddenLocation(input: HTMLElement, group: WorkableGroup): boolean {
  if (group !== 'application') return false
  const key = workableFieldKey({
    dataUi: input.getAttribute('data-ui'),
    name: input.getAttribute('name'),
    id: input.getAttribute('id'),
  })
  if (key === 'address' || key === 'phone' || key === 'email') return false
  const hidden =
    input.getAttribute('aria-hidden') === 'true' || input.getAttribute('tabindex') === '-1'
  if (!hidden) return false
  return key === 'city' || key === 'postcode' || key === 'country' || key === 'state' || key === 'zip'
}

function questionText(input: HTMLElement): string {
  const name = input.getAttribute('name') || ''
  const dataUi = input.getAttribute('data-ui') || ''
  if (!name.startsWith('QA_') && !dataUi.startsWith('QA_')) return ''
  const fieldset = input.closest('fieldset') || input.closest('[data-ui^="QA_"]')
  const chunks: string[] = []
  let node: HTMLElement | null = fieldset
  for (let i = 0; i < 4 && node; i++) {
    chunks.push(node.innerText || node.textContent || '')
    node = node.parentElement
  }
  return workableQuestionLabel(chunks)
}

function optionLabel(input: HTMLElement): string {
  const type = controlType(input)
  if (type !== 'radio' && type !== 'checkbox') return ''
  const label = input.closest('label')
  if (label) return cleanLabel(label.textContent)
  const id = input.id
  if (!id || !input.ownerDocument) return ''
  const escaped = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const external = input.ownerDocument.querySelector(`label[for="${escaped}"]`)
  return cleanLabel(external?.textContent)
}

function writeWorkablePlan(input: HTMLElement, plan: Exclude<WorkablePlan, { action: 'skip' }>): boolean {
  if (isWorkableAdvanceControl({ dataUi: input.getAttribute('data-ui'), type: controlType(input) })) {
    return false
  }
  if (plan.action === 'click') {
    const type = controlType(input)
    if (type !== 'radio' && type !== 'checkbox') return false
    clickChoice(input as HTMLInputElement)
    return true
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
  if (isWorkableMonthYearInput(input)) {
    return writeWorkableMonthYear(input as HTMLInputElement, plan.value)
  }
  setReactInputValue(input as HTMLInputElement, plan.value)
  dispatch(input, 'change')
  dispatch(input, 'blur')
  return true
}

// Workable's month/year datepicker clears the field when one input event
// carries the whole "01/2022". Typing each digit, with the slash inserted
// after the month, is what leaves MM/YYYY in place. No day is added.
function isWorkableMonthYearInput(input: HTMLElement): boolean {
  if (input.tagName !== 'INPUT') return false
  const placeholder = (input.getAttribute('placeholder') || '').replace(/\s+/g, '').toUpperCase()
  if (placeholder === 'MM/YYYY') return true
  const name = (input.getAttribute('name') || '').toLowerCase()
  return (
    (name === 'start_date' || name === 'end_date') &&
    !!input.closest('.react-datepicker-wrapper, .react-datepicker__input-container')
  )
}

type ReactTrackedInput = HTMLInputElement & {
  _valueTracker?: { setValue: (value: string) => void }
}

function writeWorkableMonthYear(input: HTMLInputElement, value: string): boolean {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length !== 6) return false
  const view = input.ownerDocument?.defaultView ?? window
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set
  if (!setter) return false
  const KeyboardEventCtor = view.KeyboardEvent ?? KeyboardEvent
  const InputEventCtor = view.InputEvent ?? InputEvent
  const expected = `${digits.slice(0, 2)}/${digits.slice(2)}`
  try {
    input.focus()
  } catch {
    // A detached jsdom document can refuse focus. The value write still runs.
  }
  for (const char of digits) {
    input.dispatchEvent(new KeyboardEventCtor('keydown', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEventCtor('keypress', { key: char, bubbles: true }))
    const previous = input.value
    const nextDigits = (previous + char).replace(/\D/g, '').slice(0, 6)
    const formatted = nextDigits.length <= 2 ? nextDigits : `${nextDigits.slice(0, 2)}/${nextDigits.slice(2)}`
    setter.call(input, formatted)
    const tracker = (input as ReactTrackedInput)._valueTracker
    if (tracker) tracker.setValue(previous)
    input.dispatchEvent(new InputEventCtor('input', { bubbles: true, data: char, inputType: 'insertText' }))
    input.dispatchEvent(new KeyboardEventCtor('keyup', { key: char, bubbles: true }))
  }
  dispatch(input, 'change')
  dispatch(input, 'blur')
  return input.value === expected
}

function clickChoice(input: HTMLInputElement) {
  if (!input.checked) input.click()
  dispatch(input, 'input')
  dispatch(input, 'change')
}

function dispatch(el: HTMLElement, type: string) {
  const EventCtor = el.ownerDocument?.defaultView?.Event ?? Event
  el.dispatchEvent(new EventCtor(type, { bubbles: true }))
}
