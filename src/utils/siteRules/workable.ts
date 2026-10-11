import type { SiteRule } from '../../types/index.ts'
import {
  documentHasWorkableForm,
  isWorkableApplyHost,
  type AtsPageContext,
} from '../ats.ts'
import { experienceForFill } from '../../lib/sync/profileRows.ts'
import { setReactInputValue } from '../inputHandlers.ts'
import {
  compareWorkableFill,
  isWorkableAdvanceControl,
  isWorkableResumeAutofillControl,
  workableFieldKey,
  workableMaySubmit,
  workablePhase,
  workablePlan,
  workableQuestionLabel,
  type WorkableField,
  type WorkableGroup,
  type WorkablePlan,
  type WorkableProfile,
} from './workableFields.ts'
import { profileSavedResume, savedResumeFromMessage, type SavedResume } from './workableResume.ts'

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
let fillTask: Promise<void> | null = null
let fillTaskGeneration = -1
let generationInfo: WorkableProfile | null = null
let generationInfoGeneration = -1
let commitTimer: ReturnType<typeof setTimeout> | null = null
let outcomes = new WeakMap<HTMLElement, { generation: number; result: true | 'skip' }>()

export function resetWorkableFormWatch() {
  if (commitTimer != null) clearTimeout(commitTimer)
  commitTimer = null
  seenFillableCount = null
  fillGeneration = 0
  completedGeneration = -1
  fillTask = null
  fillTaskGeneration = -1
  generationInfo = null
  generationInfoGeneration = -1
  // Outcomes are keyed by element and generation. Reusing generation 1 after a
  // reset must not replay the previous fill's skip on that same node.
  outcomes = new WeakMap()
}

export default function workableConfig(): SiteRule {
  return {
    detect: () => (typeof window === 'undefined' ? false : isWorkableApplyPage()),
    prepareFill: () => {
      fillGeneration += 1
    },
    apply: async (input, _fieldText, personalInfo) => {
      if (!insideWorkableForm(input)) return false
      const doc = input.ownerDocument
      if (doc) await fillWorkableDocument(doc, personalInfo)
      const info =
        generationInfo && generationInfoGeneration === fillGeneration ? generationInfo : personalInfo
      const hit = outcomes.get(input)
      if (hit && hit.generation === fillGeneration) return hit.result
      const field = describeWorkableField(input)
      const plan = workablePlan(field, info, rowIndex(input, field.group))
      if (plan.action === 'skip') return 'skip'
      return writeWorkablePlan(input, plan, profileSavedResume(info)) ? true : 'skip'
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

function fillWorkableDocument(doc: Document, personalInfo: WorkableProfile): Promise<void> {
  if (completedGeneration === fillGeneration) return Promise.resolve()
  if (fillTask && fillTaskGeneration === fillGeneration) return fillTask
  const generation = fillGeneration
  fillTaskGeneration = generation
  fillTask = runWorkableFill(doc, personalInfo, generation)
  return fillTask
}

async function runWorkableFill(doc: Document, personalInfo: WorkableProfile, generation: number) {
  const maySubmit: boolean = workableMaySubmit()
  if (maySubmit) {
    completedGeneration = generation
    return
  }
  let info = personalInfo
  try {
    info = await withSavedResume(personalInfo)
  } catch {
    info = personalInfo
  }
  if (generation !== fillGeneration) return
  completedGeneration = generation
  generationInfo = info
  generationInfoGeneration = generation
  const saved = profileSavedResume(info)
  const addedAtSaved: Record<SectionGroup, number | null> = { experience: null, education: null }
  const rememberAdd = (group: SectionGroup) => {
    addedAtSaved[group] = savedGroupCount(doc, group)
  }

  writeVisibleControls(doc, info, saved, generation, true, rememberAdd)
  // Add can mount an editor during the pass above. Fill that editor before
  // the deferred Update, and do not click Add a second time for it.
  writeVisibleControls(doc, info, saved, generation, false, rememberAdd)
  scheduleSectionCommit(doc, info, saved, generation, addedAtSaved)
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

type SectionGroup = 'education' | 'experience'

function sectionRows(info: WorkableProfile, group: SectionGroup): number {
  if (group === 'experience') return experienceForFill(info.experience).length
  return info.education?.length ?? 0
}

function writeVisibleControls(
  doc: Document,
  info: WorkableProfile,
  saved: SavedResume | null,
  generation: number,
  revealSections: boolean,
  rememberAdd: (group: SectionGroup) => void,
) {
  const items: Array<{ input: HTMLElement; field: WorkableField; row: number; order: number }> = []
  const forms = doc.querySelectorAll(FORM_ROOT)
  let order = 0
  for (let i = 0; i < forms.length; i++) {
    const controls = forms[i].querySelectorAll('input, textarea, select')
    for (let j = 0; j < controls.length; j++) {
      const input = controls[j] as HTMLElement
      if (isDatePopupControl(input)) continue
      const field = describeWorkableField(input)
      items.push({ input, field, row: rowIndex(input, field.group), order })
      order += 1
    }
  }
  items.sort(compareWorkableFill)

  let revealedExperience = false
  let revealedEducation = false
  const reveal = (nextPhase: ReturnType<typeof workablePhase> | 'end') => {
    if (!revealSections) return
    const next = nextPhase === 'end' ? WORKABLE_PHASE_END : phaseRank(nextPhase)
    if (!revealedExperience && next > phaseRank('experience')) {
      revealedExperience = true
      if (clickAddSection(doc, 'experience', sectionRows(info, 'experience'))) rememberAdd('experience')
    }
    if (!revealedEducation && next > phaseRank('education')) {
      revealedEducation = true
      if (clickAddSection(doc, 'education', sectionRows(info, 'education'))) rememberAdd('education')
    }
  }

  for (const item of items) {
    if (generation !== fillGeneration) return
    const seen = outcomes.get(item.input)
    if (seen && seen.generation === generation) continue
    reveal(workablePhase(item.field))
    const plan = workablePlan(item.field, info, item.row)
    const result: true | 'skip' =
      plan.action === 'skip' ? 'skip' : writeWorkablePlan(item.input, plan, saved) ? true : 'skip'
    outcomes.set(item.input, { generation, result })
  }
  reveal('end')
}

// Workable applies Update from React state. A blur in the same turn as the
// value write reads state that has not flushed yet and wipes the row, and it
// leaves the month popup open. Close and Update on a later turn, once.
function scheduleSectionCommit(
  doc: Document,
  info: WorkableProfile,
  saved: SavedResume | null,
  generation: number,
  addedAtSaved: Record<SectionGroup, number | null>,
) {
  if (commitTimer != null) clearTimeout(commitTimer)
  const attempted = new Set<Element>()
  const groups: SectionGroup[] = ['experience', 'education']
  const limit = Math.min(8, sectionRows(info, 'experience') + sectionRows(info, 'education') + 1)
  const step = (left: number) => {
    commitTimer = null
    if (generation !== fillGeneration || left < 0) return
    try {
      closeOpenDatePickers(doc)
      commitOpenEditors(doc, attempted)
      let grew = false
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        const remembered = addedAtSaved[group]
        const savedRows = savedGroupCount(doc, group)
        if (remembered != null && savedRows <= remembered) continue
        const before = editorCount(doc, group)
        const clicked = clickAddSection(doc, group, sectionRows(info, group))
        if (!clicked) continue
        addedAtSaved[group] = savedRows
        if (editorCount(doc, group) > before) grew = true
      }
      if (!grew) return
      writeVisibleControls(doc, info, saved, generation, false, () => {})
    } catch {
      return
    }
    commitTimer = setTimeout(() => step(left - 1), 0)
  }
  commitTimer = setTimeout(() => step(limit), 0)
}

function clickAddSection(doc: Document, group: SectionGroup, profileRows: number): boolean {
  if (profileRows <= 0) return false
  if (editorCount(doc, group) + savedGroupCount(doc, group) >= profileRows) return false
  const section = sectionElement(doc, group)
  const button = section?.querySelector('button[data-ui="add-section"]')
  if (!button || button.tagName !== 'BUTTON') return false
  const control = button as HTMLButtonElement
  if (control.disabled) return false
  if (
    isWorkableAdvanceControl({
      dataUi: control.getAttribute('data-ui'),
      type: control.type,
    }) ||
    isWorkableResumeAutofillControl({
      dataUi: control.getAttribute('data-ui'),
      label: control.textContent,
    })
  ) {
    return false
  }
  control.click()
  return true
}

function sectionElement(doc: Document, group: SectionGroup): Element | null {
  return doc.querySelector(`[data-ui="application-form"] [data-ui="${group}"]`)
}

function editorCount(doc: Document, group: SectionGroup): number {
  const section = sectionElement(doc, group)
  if (!section) return 0
  return section.querySelectorAll('[data-ui="editor"]').length
}

// A saved education/experience card is [data-ui="group"]. The edit control is
// not in the DOM until its menu opens, so the card itself is the row count.
function savedGroupCount(doc: Document, group: SectionGroup): number {
  const section = sectionElement(doc, group)
  if (!section) return 0
  return section.querySelectorAll('[data-ui="group"]').length
}

function savedGroupCountIn(section: Element): number {
  return section.querySelectorAll('[data-ui="group"]').length
}

function commitOpenEditors(doc: Document, attempted: Set<Element>) {
  const groups: SectionGroup[] = ['experience', 'education']
  for (let i = 0; i < groups.length; i++) {
    const section = sectionElement(doc, groups[i])
    if (!section) continue
    const editors = section.querySelectorAll('[data-ui="editor"]')
    for (let j = 0; j < editors.length; j++) {
      const editor = editors[j]
      if (attempted.has(editor)) continue
      if (!editorReadyToSave(editor, groups[i])) continue
      const button = editor.querySelector('button[data-ui="save-section"]')
      if (!button || button.tagName !== 'BUTTON') continue
      const control = button as HTMLButtonElement
      if (control.disabled) continue
      if (
        isWorkableAdvanceControl({
          dataUi: control.getAttribute('data-ui'),
          type: control.type,
        }) ||
        isWorkableResumeAutofillControl({
          dataUi: control.getAttribute('data-ui'),
          label: control.textContent,
        })
      ) {
        continue
      }
      attempted.add(editor)
      closeOpenDatePickers(editor)
      control.click()
    }
  }
}

function editorReadyToSave(editor: Element, group: SectionGroup): boolean {
  const name = group === 'experience' ? 'title' : 'school'
  const field = editor.querySelector(`input[name="${name}"]`)
  if (!field || field.tagName !== 'INPUT') return false
  return (field as HTMLInputElement).value.trim().length > 0
}

function closeOpenDatePickers(root: ParentNode) {
  if (!root.querySelector('.react-datepicker, .react-datepicker-popper, .react-datepicker__tab-loop')) return
  const inputs = root.querySelectorAll('input[name="start_date"], input[name="end_date"]')
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    if (input.tagName !== 'INPUT') continue
    closeWorkableDatePicker(input as HTMLInputElement)
  }
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
      const controls = forms[i].querySelectorAll('input, textarea, select')
      for (let j = 0; j < controls.length; j++) {
        // An open month/year popup mounts inputs inside the form. Counting them
        // would schedule another fill, which focuses the date again.
        if (isDatePopupControl(controls[j])) continue
        total += 1
      }
    }
    return total
  } catch {
    return 0
  }
}

function isDatePopupControl(el: Element): boolean {
  return !!el.closest('.react-datepicker, .react-datepicker__tab-loop, .react-datepicker-popper')
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
  const type = controlType(input)
  return {
    dataUi: input.getAttribute('data-ui'),
    name: input.getAttribute('name'),
    id: input.getAttribute('id'),
    type,
    label: questionText(input) || (type === 'file' ? resumeControlLabel(input) : ''),
    optionValue: (input as HTMLInputElement).value || input.getAttribute('value'),
    optionLabel: optionLabel(input),
    group,
    hidden: isHiddenLocation(input, group),
    placeholder: input.getAttribute('placeholder'),
    sectionUi: type === 'file' ? sectionDataUi(input) : null,
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
    if (editors[i] === editor) return savedGroupCountIn(section) + i
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

function sectionDataUi(input: HTMLElement): string | null {
  let node = input.parentElement
  while (node) {
    const ui = node.getAttribute('data-ui')
    if (ui && ui !== 'application-form' && ui !== 'eeoc-form' && ui !== 'editor') return ui
    node = node.parentElement
  }
  return null
}

function labelTextWithoutControls(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('input, textarea, select, button, a, script, style').forEach((node) => {
    node.remove()
  })
  return cleanLabel(clone.textContent)
}

function resumeControlLabel(input: HTMLElement): string {
  const aria = cleanLabel(input.getAttribute('aria-label'))
  if (aria) return aria
  const labelledBy = input.getAttribute('aria-labelledby')
  if (labelledBy && input.ownerDocument) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => input.ownerDocument?.getElementById(id)?.textContent || '')
      .join(' ')
    const cleaned = cleanLabel(text)
    if (cleaned) return cleaned
  }
  const id = input.id
  if (id && input.ownerDocument) {
    const escaped = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const external = input.ownerDocument.querySelector(`label[for="${escaped}"]`)
    const cleaned = cleanLabel(external?.textContent)
    if (cleaned) return cleaned
  }
  const wrapping = input.closest('label')
  if (wrapping) {
    const cleaned = labelTextWithoutControls(wrapping)
    if (cleaned) return cleaned
  }
  const parent = input.parentElement
  if (parent) {
    const cleaned = labelTextWithoutControls(parent)
    if (cleaned && cleaned.length <= 80) return cleaned
  }
  return ''
}

async function withSavedResume(info: WorkableProfile): Promise<WorkableProfile> {
  if (profileSavedResume(info)) return info
  const remote = await requestStoredResume()
  if (!remote) return info
  return { ...info, resumeFile: { name: remote.name, type: remote.type, bytes: remote.bytes } }
}

async function requestStoredResume(): Promise<SavedResume | null> {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined
  if (!runtime?.sendMessage) return null
  try {
    const response: unknown = await runtime.sendMessage({ action: 'loadSavedResume' })
    return savedResumeFromMessage(response)
  } catch {
    return null
  }
}

function attachResumeFile(input: HTMLInputElement, saved: SavedResume): boolean {
  const view = input.ownerDocument?.defaultView
  if (!view) return false
  const FileCtor = view.File
  if (typeof FileCtor !== 'function') return false
  let file: File
  try {
    file = new FileCtor([saved.bytes as unknown as BlobPart], saved.name, { type: saved.type })
  } catch {
    return false
  }
  if (!assignFileList(input, file, view)) return false
  dispatch(input, 'input')
  dispatch(input, 'change')
  const attached = input.files?.[0]
  return !!attached && attached.name === saved.name && attached.size === file.size
}

function assignFileList(input: HTMLInputElement, file: File, view: Window): boolean {
  const DataTransferCtor = (view as Window & { DataTransfer?: new () => DataTransfer }).DataTransfer
  if (typeof DataTransferCtor === 'function') {
    const transfer = new DataTransferCtor()
    transfer.items.add(file)
    return setFiles(input, transfer.files)
  }
  // jsdom has no DataTransfer. An own `files` getter is what the tests read.
  // Chrome takes the DataTransfer path above and never defines this property.
  try {
    Object.defineProperty(input, 'files', {
      configurable: true,
      enumerable: true,
      get() {
        return {
          0: file,
          length: 1,
          item(index: number) {
            return index === 0 ? file : null
          },
        }
      },
    })
  } catch {
    return false
  }
  return !!input.files && input.files.length === 1 && input.files[0]?.name === file.name
}

function setFiles(input: HTMLInputElement, files: FileList): boolean {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'files')?.set
  try {
    if (setter) setter.call(input, files)
    else input.files = files
  } catch {
    return false
  }
  return !!input.files && input.files.length > 0 && input.files[0]?.name === files[0]?.name
}

function writeWorkablePlan(
  input: HTMLElement,
  plan: Exclude<WorkablePlan, { action: 'skip' }>,
  saved: SavedResume | null,
): boolean {
  const described = describeWorkableField(input)
  if (
    isWorkableAdvanceControl({ dataUi: described.dataUi, type: described.type }) ||
    isWorkableResumeAutofillControl(described)
  ) {
    return false
  }
  if (plan.action === 'file') {
    if (controlType(input) !== 'file') return false
    if (!saved) return false
    return attachResumeFile(input as HTMLInputElement, saved)
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
  // Leave the popup for the deferred close. Blurring here, before React flushes
  // the typed month, makes Workable revert the field.
  return input.value === expected
}

// A synthetic Escape without keyCode does not close react-datepicker, and a
// real blur reverts the month. Moving focus with mousedown keeps the value.
function closeWorkableDatePicker(input: HTMLInputElement) {
  const view = input.ownerDocument?.defaultView
  if (!view) return
  const editor = input.closest('[data-ui="editor"]')
  const host = editor?.querySelector(
    'input[name="title"], input[name="school"], input[name="company"], input[name="field_of_study"], textarea',
  )
  if (host && host !== input && host.tagName) {
    const MouseEventCtor = view.MouseEvent ?? MouseEvent
    try {
      host.dispatchEvent(new MouseEventCtor('mousedown', { bubbles: true, cancelable: true }))
    } catch {
      // The node can be in a document whose events cannot be constructed.
    }
    try {
      if (typeof (host as HTMLElement).focus === 'function') (host as HTMLElement).focus()
    } catch {
      // Detached jsdom nodes can refuse focus.
    }
    if (!input.ownerDocument?.querySelector('.react-datepicker, .react-datepicker-popper')) return
  }
  const KeyboardEventCtor = view.KeyboardEvent ?? KeyboardEvent
  try {
    const event = new KeyboardEventCtor('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    try {
      Object.defineProperty(event, 'keyCode', { get: () => 27 })
      Object.defineProperty(event, 'which', { get: () => 27 })
    } catch {
      // keyCode is non-configurable in some realms. The key name is still set.
    }
    input.dispatchEvent(event)
  } catch {
    // Ignore a document that cannot construct a keyboard event.
  }
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
