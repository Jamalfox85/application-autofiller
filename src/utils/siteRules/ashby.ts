import type { SiteRule } from '../../types/index.ts'
import { detectAts } from '../ats.ts'
import { fillNativeInput, fillReactSelect, setSelectValue } from '../inputHandlers.ts'
import {
  ashbyEducationDateValue,
  ashbyEducationTextValue,
  ashbyEeoKind,
  ashbyEeoOptionMatches,
  ashbyEeoSearchLabels,
  ashbyEeoYesNo,
  ashbyDateSelectKind,
  ashbyLocationQueries,
  ashbySchoolQueries,
  ashbyTextValue,
  ashbyYesNoDecision,
  ashbyYesNoOption,
  isAshbyLocationField,
  isAshbyResumeField,
  isAshbySchoolField,
  shouldRevealAshbyEducationEntry,
  type AshbyYesNo,
} from './ashbyFields.ts'

// One click per page. formChanged sees the new inputs and runs autofill again.
let revealedSecondEducation = false

// Snapshot at load. The application tab and survey mount inputs after the job
// posting shell, which increases this count. Typing into a field does not.
let seenFillableCount = countAshbyFillableFields()

const FORM_ROOTS = ['.ashby-application-form-container', '.ashby-survey-form-container']

export default function ashbyConfig(): SiteRule {
  return {
    // Hosted boards only (*.ashbyhq.com). Embedded forms on other hosts are deferred.
    detect: () =>
      detectAts({
        hostname: window.location.hostname,
        href: window.location.href,
        document,
      }) === 'ashby',
    apply: async (input, _fieldText, personalInfo) => {
      const context = readAshbyField(input)
      if (!context) return false

      if (input instanceof HTMLSelectElement) {
        return fillEducationDate(input, context, personalInfo)
      }

      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
        return false
      }

      if (
        isAshbyResumeField({ path: context.path, title: context.title, type: input.type, id: input.id })
      ) {
        // Resume hook: the dropzone is `_systemfield_resume`. personalInfo only
        // has resumeFileName, so there is no file to attach. Leave it for the user.
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
        return fillAshbyAutocomplete(input, queries)
      }

      const eeoKind = ashbyEeoKind(context.title)
      if (eeoKind && personalInfo.eeoAnswersEnabled !== false) {
        if (isAutocomplete(input)) {
          const labels = ashbyEeoSearchLabels(eeoKind, personalInfo)
          if (labels.length === 0) return false
          return fillAshbyAutocomplete(input, labels)
        }

        if (
          input instanceof HTMLInputElement &&
          (input.type === 'radio' || (input.type === 'checkbox' && context.optionLabel))
        ) {
          if (!ashbyEeoOptionMatches(eeoKind, context.optionLabel, personalInfo)) return false
          clickChoice(input)
          return true
        }
      }

      const yesNo =
        ashbyYesNoDecision(context.title, personalInfo) ||
        (eeoKind ? ashbyEeoYesNo(eeoKind, personalInfo) : null)
      if (yesNo) {
        const option = ashbyYesNoOption(context.optionLabel)
        if (option) {
          if (option !== yesNo || !(input instanceof HTMLInputElement)) return false
          clickChoice(input)
          return true
        }
        if (input.type === 'checkbox' && context.entry) {
          return clickYesNo(context.entry, yesNo)
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

function countAshbyFillableFields(): number {
  if (typeof document === 'undefined') return 0
  return FORM_ROOTS.reduce((total, root) => {
    return (
      total +
      document.querySelectorAll(`${root} input:not([type="hidden"]), ${root} textarea, ${root} select`)
        .length
    )
  }, 0)
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

async function fillAshbyAutocomplete(
  input: HTMLInputElement | HTMLTextAreaElement,
  queries: string[],
): Promise<boolean> {
  const filled = await fillReactSelect(input, queries, '[role="option"]')
  if (!filled) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    input.blur()
  }
  return filled
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
