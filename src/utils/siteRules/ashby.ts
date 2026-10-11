import type { SiteRule } from '../../types/index.ts'
import { detectAts } from '../ats.ts'
import { fillNativeInput, setReactInputValue, setSelectValue } from '../inputHandlers.ts'
import { bestOptionIndex } from '../optionMatch.ts'
import {
  ashbyEducationDateValue,
  ashbyEducationTextValue,
  ashbyEeoKind,
  ashbyEeoOptionMatches,
  ashbyEeoSearchLabels,
  ashbyEeoYesNo,
  freshAshbyEeoTally,
  markAshbyEeoFilled,
  observeAshbyEeoField,
  type AshbyEeoKind,
  ashbyDateSelectKind,
  ashbyLocationQueries,
  pickAshbyLocationOption,
  ashbySchoolQueries,
  ashbyTextValue,
  ashbyYesNoDecision,
  ashbyYesNoOption,
  isAshbyLocationField,
  isAshbyResumeField,
  isAshbySchoolField,
  shouldRevealAshbyEducationEntry,
  ashbyEeoTelemetry,
  type AshbyYesNo,
} from './ashbyFields.ts'
import { applyAshbyResumeFile, resetAshbySavedResumeRequest } from './ashbyResumeFile.ts'

// One click per page. formChanged sees the new inputs and runs autofill again.
let revealedSecondEducation = false

// Reset at the start of each fill. Counts gender, race, veteran, and disability.
let eeoTally = freshAshbyEeoTally()

const FORM_ROOTS = ['.ashby-application-form-container', '.ashby-survey-form-container']

// Snapshot at load. The application tab and survey mount inputs after the job
// posting shell, which increases this count. Typing into a field does not.
// FORM_ROOTS must already be initialized: this module is imported by the content
// script, and countAshbyFillableFields is hoisted. Reading a const before its
// initializer throws, which aborts the whole content script before the autofill
// listener is registered.
let seenFillableCount = countAshbyFillableFields()

export default function ashbyConfig(): SiteRule {
  return {
    // Hosted boards only (*.ashbyhq.com). Embedded forms on other hosts are deferred.
    detect: () =>
      detectAts({
        hostname: window.location.hostname,
        href: window.location.href,
        document,
      }) === 'ashby',
    prepareFill: () => {
      eeoTally = freshAshbyEeoTally()
      resetAshbySavedResumeRequest()
    },
    fillTelemetry: () => ashbyEeoTelemetry(eeoTally),
    apply: async (input, _fieldText, personalInfo) => {
      const context = readAshbyField(input)
      if (!context) return false

      const eeoKind: AshbyEeoKind | null = ashbyEeoKind(context.title)
      if (eeoKind) observeAshbyEeoField(eeoTally, eeoKind, personalInfo)

      if (isFileControl(input)) {
        // Plain Resume / Upload / Choose file only. "Autofill from resume" is
        // skipped inside applyAshbyResumeFile and is never clicked or given a file.
        return applyAshbyResumeFile(input, {
          path: context.path,
          title: context.title,
          id: input.id,
          name: input.name,
          type: input.type,
        })
      }

      if (input instanceof HTMLSelectElement) {
        return fillEducationDate(input, context, personalInfo)
      }

      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
        return false
      }

      if (
        isAshbyResumeField({ path: context.path, title: context.title, type: input.type, id: input.id })
      ) {
        // A non-file resume control is not the plain chooser. Leave it blank.
        return false
      }

      if (input.type === 'file') return false

      const educationIndex = educationEntryIndex(input, context.path)

      if (input instanceof HTMLInputElement && input.id.endsWith('-isCurrent')) {
        return fillStillStudent(input, educationIndex, personalInfo)
      }

      if (
        educationIndex != null &&
        isAshbySchoolField(context, {
          placeholder: input.getAttribute('placeholder'),
          autocomplete: isAutocomplete(input),
        })
      ) {
        revealSecondEducation(personalInfo)
        const queries = ashbySchoolQueries(personalInfo.education?.[educationIndex]?.schoolName)
        if (queries.length === 0) return false
        return fillAshbyAutocomplete(input, queries)
      }

      if (isAutocomplete(input) && isAshbyLocationField(context.path, context.title)) {
        const queries = ashbyLocationQueries(personalInfo)
        if (queries.length === 0) return false
        return fillAshbyAutocomplete(input, queries, (options) =>
          pickAshbyLocationOption(options, personalInfo),
        )
      }

      if (eeoKind && personalInfo.eeoAnswersEnabled !== false) {
        if (isAutocomplete(input)) {
          const labels = ashbyEeoSearchLabels(eeoKind, personalInfo)
          if (labels.length === 0) return false
          const filled = await fillAshbyAutocomplete(input, labels)
          if (filled) markAshbyEeoFilled(eeoTally, eeoKind)
          return filled
        }

        if (
          input instanceof HTMLInputElement &&
          (input.type === 'radio' || (input.type === 'checkbox' && context.optionLabel))
        ) {
          if (ashbyEeoOptionMatches(eeoKind, context.optionLabel, personalInfo)) {
            clickChoice(input)
            markAshbyEeoFilled(eeoTally, eeoKind)
            return true
          }
          // A short Yes/No label does not match the long survey phrases. Fall
          // through so ashbyEeoYesNo can still press that button.
        }
      }

      const workDecision = ashbyYesNoDecision(context.title, personalInfo)
      const eeoDecision =
        eeoKind && personalInfo.eeoAnswersEnabled !== false
          ? ashbyEeoYesNo(eeoKind, personalInfo)
          : null
      const yesNo = workDecision || eeoDecision
      if (yesNo) {
        const option = ashbyYesNoOption(context.optionLabel)
        if (option) {
          if (option !== yesNo || !(input instanceof HTMLInputElement)) return false
          clickChoice(input)
          if (eeoKind && eeoDecision && !workDecision) markAshbyEeoFilled(eeoTally, eeoKind)
          return true
        }
        if (input.type === 'checkbox' && context.entry) {
          const clicked = clickYesNo(context.entry, yesNo)
          if (clicked && eeoKind && eeoDecision && !workDecision) markAshbyEeoFilled(eeoTally, eeoKind)
          return clicked
        }
      }

      if (input.id.endsWith('-degree') || input.id.endsWith('-major')) {
        // Both education rows reuse the same id suffix. Index picks the profile row.
        // A third row is left alone so it is not overwritten with the first school.
        if (educationIndex == null) return false
        revealSecondEducation(personalInfo)
        const value = ashbyEducationTextValue(input.id, personalInfo, educationIndex)
        if (!value || !(input instanceof HTMLTextAreaElement || isWritableText(input))) return false
        return fillNativeInput(input, value)
      }

      if (input instanceof HTMLTextAreaElement || isWritableText(input)) {
        const value = ashbyTextValue(context, personalInfo)
        if (!value) return false
        return fillNativeInput(input, value)
      }

      return false
    },
    formChanged: () => {
      const count = countAshbyFillableFields()
      if (count > seenFillableCount) {
        seenFillableCount = count
        return true
      }
      return false
    },
  }
}

function isFileControl(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): input is HTMLInputElement {
  return input.tagName?.toUpperCase() === 'INPUT' && (input.type || '').toLowerCase() === 'file'
}

function countAshbyFillableFields(): number {
  if (typeof document === 'undefined') return 0
  try {
    return FORM_ROOTS.reduce((total, root) => {
      return (
        total +
        document.querySelectorAll(`${root} input:not([type="hidden"]), ${root} textarea, ${root} select`)
          .length
      )
    }, 0)
  } catch (error) {
    console.error('Ashby fillable-field count failed', error)
    return 0
  }
}

type AshbyFieldContext = {
  path: string
  title: string
  optionLabel: string
  id: string
  type: string
  entry: Element | null
  dateContainerId: string | null
}

function readAshbyField(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): AshbyFieldContext | null {
  const entry = input.closest('[data-field-path], .ashby-application-form-field-entry')
  const inAshby =
    !!entry ||
    !!input.closest('.ashby-application-form-container, .ashby-survey-form-container, .ashby-application-form-input-autocomplete')
  if (!inAshby) return null

  const path = entry?.getAttribute('data-field-path') || input.getAttribute('name') || ''
  const forLabel = labeledBy(input)
  const optionWrap = forLabel?.closest(
    '.ashby-application-form-input-radio-group-option, .ashby-application-form-input-checkbox-group-option',
  )
  const optionLabel = optionWrap ? cleanText(forLabel?.textContent) : ''
  const questionFromLabel =
    !optionWrap && forLabel?.closest('.ashby-application-form-question-title')
  const title = questionFromLabel
    ? cleanText(questionFromLabel.textContent)
    : cleanText(entry?.querySelector('.ashby-application-form-question-title')?.textContent)
  const dateContainer = input.closest('[id$="-startDate"], [id$="-endDate"]')

  return {
    path,
    title,
    optionLabel,
    id: input.id || '',
    type: input.type || '',
    entry,
    dateContainerId: dateContainer?.id || null,
  }
}

function labeledBy(input: HTMLElement): HTMLElement | null {
  if (!input.id || typeof document === 'undefined') return null
  // Attribute selector, not an id selector. Ashby ids are often UUIDs that start
  // with a digit, which is legal in for="..." and illegal in #id.
  const attr = input.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return document.querySelector<HTMLElement>(`label[for="${attr}"]`)
}

function cleanText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function isAutocomplete(input: HTMLElement): boolean {
  return (
    input.getAttribute('aria-autocomplete') === 'list' ||
    !!input.closest('.ashby-application-form-input-autocomplete')
  )
}

function isWritableText(input: HTMLInputElement): boolean {
  const type = (input.type || 'text').toLowerCase()
  return type === 'text' || type === 'email' || type === 'tel' || type === 'url' || type === 'search' || type === ''
}

// Repeatable entries are siblings under one parent. A form that is not
// repeatable has no entry wrapper; those controls are the first row.
// Hosted apply forms do not render an employment-history section, so there
// is no matching index for a second company/title/date/description block.
function educationEntryIndex(input: HTMLElement, path: string): number | null {
  const block = input.closest('.ashby-application-form-input-education-entry')
  if (block?.parentElement) {
    const entries = Array.from(block.parentElement.children).filter((el) =>
      el.classList.contains('ashby-application-form-input-education-entry'),
    )
    const index = entries.indexOf(block)
    return index === 0 || index === 1 ? index : null
  }
  if (path === '_systemfield_education_history' || (input.id || '').includes('education_history')) {
    return 0
  }
  return null
}

function revealSecondEducation(personalInfo: Parameters<SiteRule['apply']>[2]) {
  if (revealedSecondEducation || typeof document === 'undefined') return
  const rendered = document.querySelectorAll('.ashby-application-form-input-education-entry').length
  if (!shouldRevealAshbyEducationEntry(rendered, personalInfo)) return
  // Plaid puts the class on the button. The bundle also wraps that button.
  // A disabled control means this posting caps the section (often at one row).
  const button = document.querySelector<HTMLButtonElement>(
    'button.ashby-application-form-input-education-add, .ashby-application-form-input-education-add button',
  )
  if (!button || button.disabled) return
  revealedSecondEducation = true
  button.click()
}

function fillEducationDate(
  input: HTMLSelectElement,
  context: { path: string; dateContainerId: string | null },
  personalInfo: Parameters<SiteRule['apply']>[2],
): boolean {
  const index = educationEntryIndex(input, context.path)
  if (index == null || !context.dateContainerId) return false
  revealSecondEducation(personalInfo)
  const labels = Array.from(input.options).map((option) => option.textContent || option.label || '')
  const kind = ashbyDateSelectKind(labels)
  if (!kind) return false
  const value = ashbyEducationDateValue(context.dateContainerId, kind, personalInfo, index)
  if (!value) return false
  return setSelectValue(input, value, '')
}

function fillStillStudent(
  input: HTMLInputElement,
  index: number | null,
  personalInfo: Parameters<SiteRule['apply']>[2],
): boolean {
  if (index == null) return false
  revealSecondEducation(personalInfo)
  if (!personalInfo.education?.[index]?.current) return false
  clickChoice(input)
  return true
}

// Ashby location and school widgets keep the search string in the combobox until an
// option is chosen. A typed label that matches a suggestion is still empty to the
// form. Blur drops that text; a real selection stays, with no validation error.
type AshbyAutocompleteTiming = {
  suggestionTimeoutMs: number
  verifyDelayMs: number
  typeDelayMs: number
}

const ASHBY_AUTOCOMPLETE_TIMING: AshbyAutocompleteTiming = {
  suggestionTimeoutMs: 2000,
  verifyDelayMs: 200,
  typeDelayMs: 12,
}

let ashbyAutocompleteTiming: AshbyAutocompleteTiming = { ...ASHBY_AUTOCOMPLETE_TIMING }

export function setAshbyAutocompleteTimingForTests(next: Partial<AshbyAutocompleteTiming> | null) {
  ashbyAutocompleteTiming = next ? { ...ASHBY_AUTOCOMPLETE_TIMING, ...next } : { ...ASHBY_AUTOCOMPLETE_TIMING }
}

async function fillAshbyAutocomplete(
  input: HTMLInputElement | HTMLTextAreaElement,
  queries: string[],
  pickOption?: (optionTexts: string[]) => string | null,
): Promise<boolean> {
  if (!(input instanceof HTMLInputElement)) return false
  for (const query of queries) {
    if (await commitAshbyQuery(input, query, pickOption)) return true
  }
  clearAshbyTypeahead(input)
  return false
}

// Click the best row, then confirm the label survived blur. One retry uses the
// keyboard, because a click that only copies the suggestion into the box leaves
// the caret there and the form still treats the field as empty.
async function commitAshbyQuery(
  input: HTMLInputElement,
  query: string,
  pickOption?: (optionTexts: string[]) => string | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await typeAshbyQuery(input, query)
    const options = await waitForAshbyOptions(input)
    if (options.length === 0) {
      clearAshbyTypeahead(input)
      return false
    }
    const texts = options.map((option) => collapseText(option.textContent))
    const chosen = pickOption ? pickOption(texts) : defaultAshbyOption(texts, query)
    const option = chosen ? options.find((node) => collapseText(node.textContent) === collapseText(chosen)) : undefined
    if (!chosen || !option) {
      clearAshbyTypeahead(input)
      return false
    }
    if (attempt === 0) clickAshbyOption(option)
    else await keyboardChooseAshbyOption(input, chosen)
    if (await ashbySelectionCommitted(input, chosen)) return true
    clearAshbyTypeahead(input)
  }
  return false
}

async function typeAshbyQuery(input: HTMLInputElement, query: string) {
  const view = viewOf(input)
  input.focus()
  input.dispatchEvent(new view.FocusEvent('focus', { bubbles: true }))
  setReactInputValue(input, '')
  let current = ''
  for (const char of query) {
    current += char
    const code = char === ' ' ? 'Space' : /^[a-zA-Z]$/.test(char) ? `Key${char.toUpperCase()}` : char
    dispatchKey(input, 'keydown', char, code)
    setReactInputValue(input, current)
    dispatchKey(input, 'keyup', char, code)
    if (ashbyAutocompleteTiming.typeDelayMs > 0) await delay(ashbyAutocompleteTiming.typeDelayMs)
  }
}

async function waitForAshbyOptions(input: HTMLInputElement): Promise<HTMLElement[]> {
  const deadline = Date.now() + ashbyAutocompleteTiming.suggestionTimeoutMs
  let found: HTMLElement[] = []
  while (Date.now() < deadline) {
    found = ashbySuggestionOptions(input)
    if (found.length > 0) {
      await delay(Math.min(40, ashbyAutocompleteTiming.verifyDelayMs))
      const settled = ashbySuggestionOptions(input)
      return settled.length > 0 ? settled : found
    }
    await delay(25)
  }
  return []
}

function ashbySuggestionOptions(input: HTMLInputElement): HTMLElement[] {
  const doc = input.ownerDocument
  if (!doc) return []
  const controls = input.getAttribute('aria-controls')
  const owned = controls ? doc.getElementById(controls) : null
  const list =
    owned ||
    input.closest('[data-field-path], .ashby-application-form-field-entry')?.querySelector('[role="listbox"]') ||
    null
  const root = list || (input.getAttribute('aria-expanded') === 'true' ? onlyOpenListbox(doc) : null)
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')).filter((option) => {
    const text = collapseText(option.textContent).toLowerCase()
    return !!text && text !== 'no options' && !text.startsWith('loading')
  })
}

function onlyOpenListbox(doc: Document): Element | null {
  const lists = Array.from(doc.querySelectorAll('[role="listbox"]'))
  return lists.length === 1 ? lists[0] : null
}

function defaultAshbyOption(texts: string[], query: string): string | null {
  const index = bestOptionIndex(texts, query)
  return index >= 0 ? texts[index] : null
}

function clickAshbyOption(option: HTMLElement) {
  const view = viewOf(option)
  const init: MouseEventInit = { bubbles: true, cancelable: true, view }
  option.dispatchEvent(new view.MouseEvent('mousedown', init))
  option.dispatchEvent(new view.MouseEvent('mouseup', init))
  option.click()
}

async function keyboardChooseAshbyOption(input: HTMLInputElement, label: string) {
  input.focus()
  for (let step = 0; step < 16; step++) {
    if (input.getAttribute('aria-expanded') !== 'true') return
    const options = ashbySuggestionOptions(input)
    const active = options.find((option) => option.getAttribute('aria-selected') === 'true')
    if (active && collapseText(active.textContent) === collapseText(label)) {
      dispatchKey(input, 'keydown', 'Enter', 'Enter')
      dispatchKey(input, 'keyup', 'Enter', 'Enter')
      return
    }
    dispatchKey(input, 'keydown', 'ArrowDown', 'ArrowDown')
    dispatchKey(input, 'keyup', 'ArrowDown', 'ArrowDown')
    await delay(20)
  }
}

// The visible value has to still be the chosen place after blur, and the field
// must not be showing a validation error. Uncommitted text is gone by then.
async function ashbySelectionCommitted(input: HTMLInputElement, label: string): Promise<boolean> {
  await delay(ashbyAutocompleteTiming.verifyDelayMs)
  if (collapseText(input.value) !== collapseText(label)) return false
  blurAshbyInput(input)
  await delay(ashbyAutocompleteTiming.verifyDelayMs)
  if (collapseText(visibleAshbyValue(input)) !== collapseText(label)) return false
  if (input.getAttribute('aria-invalid') === 'true') return false
  return !ashbyFieldHasError(input)
}

function visibleAshbyValue(input: HTMLInputElement): string {
  const typed = collapseText(input.value)
  if (typed) return typed
  const single = input.closest('.select')?.querySelector('.select__single-value')
  return collapseText(single?.textContent)
}

function ashbyFieldHasError(input: HTMLInputElement): boolean {
  const entry = input.closest('[data-field-path], .ashby-application-form-field-entry')
  if (!entry) return false
  for (const alert of Array.from(entry.querySelectorAll<HTMLElement>('[role="alert"]'))) {
    if (alert.hidden) continue
    if (collapseText(alert.textContent)) return true
  }
  return false
}

function clearAshbyTypeahead(input: HTMLInputElement) {
  setReactInputValue(input, '')
  dispatchKey(input, 'keydown', 'Escape', 'Escape')
  dispatchKey(input, 'keyup', 'Escape', 'Escape')
  blurAshbyInput(input)
  if (input.value.trim()) setReactInputValue(input, '')
}

function blurAshbyInput(input: HTMLInputElement) {
  const view = viewOf(input)
  input.dispatchEvent(new view.FocusEvent('blur', { bubbles: false }))
  input.dispatchEvent(new view.FocusEvent('focusout', { bubbles: true }))
  input.blur()
}

function dispatchKey(target: HTMLElement, type: 'keydown' | 'keyup', key: string, code: string) {
  const view = viewOf(target)
  target.dispatchEvent(new view.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }))
}

function viewOf(node: Node): Window {
  return (node.ownerDocument?.defaultView as Window | null) ?? window
}

function collapseText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clickYesNo(root: Element, choice: AshbyYesNo): boolean {
  const marked = root.querySelector<HTMLButtonElement>(`button[data-option="${choice}"]`)
  if (marked) {
    marked.click()
    return true
  }
  const fallback = Array.from(root.querySelectorAll('button')).find(
    (button) => button.textContent?.trim().toLowerCase() === choice,
  )
  if (!fallback) return false
  fallback.click()
  return true
}

function clickChoice(input: HTMLInputElement) {
  if (input.checked) return
  input.click()
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
