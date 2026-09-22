import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { detectAts } from '../ats.ts'
import { fillNativeInput, fillReactSelect, setReactInputValue } from '../../utils/inputHandlers'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'
import {
  dialingCodeSearchValues,
  employmentFillPlan,
  isGreenhousePhoneDialingCodeField,
  locationSearchQueries,
  parseGreenhouseEmploymentField,
  phoneDialingCodeTarget,
  pickDialingCodeOption,
  pickLocationOption,
} from './greenhouseFields.ts'
import {
  countrySearchValues,
  degreeSearchValues,
  disciplineSearchValues,
  greenhouseEducationRowsToAdd,
  isResidenceCountryField,
  isStateQuestion,
  monthNameFromLooseDate,
  parseGreenhouseEducationId,
  pickDegreeOption,
  pickDisciplineOption,
  pickMonthOption,
  pickSchoolOption,
  schoolSearchValues,
  stateSearchValues,
  yearFromLooseDate,
  type GreenhouseEducationField,
} from './greenhouseValues.ts'

// Snapshot at load. Greenhouse mounts city/race/education inputs only after an
// earlier answer, which increases this count. Replacing a react-select node
// during typing does not, so a refill doesn't loop.
let seenFillableCount = countGreenhouseFillableFields()

export default function greenhouseConfig(): SiteRule {
  return {
    // Hostname greenhouse.io plus embed signals (gh_jid, #application-form, boards iframe).
    detect: () =>
      detectAts({
        hostname: window.location.hostname,
        href: window.location.href,
        document,
      }) === 'greenhouse',
    onMount: (personalInfo) => {
      void ensureGreenhouseEducationRows(personalInfo?.education?.length ?? 0)
    },
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: () => {
      const count = countGreenhouseFillableFields()
      if (count > seenFillableCount) {
        seenFillableCount = count
        return true
      }
      return false
    },
  }
}

function countGreenhouseFillableFields(): number {
  if (typeof document === 'undefined') return 0
  const root = document.getElementById('application-form') || document.body
  if (!root) return 0
  return root.querySelectorAll('input:not([type="hidden"]), textarea, select').length
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    // #country is the phone dialing-code combobox ("United States +1"), not a
    // country-of-residence question_* select.
    match: (input, _) => isGreenhousePhoneDialingCodeField(input.getAttribute('id')),
    handle: async (input, _, personalInfo) => {
      const target = phoneDialingCodeTarget(personalInfo)
      if (!target) return true
      await fillReactSelect(
        input,
        dialingCodeSearchValues(target),
        '[id^=react-select-country-option-]',
        (options) => pickDialingCodeOption(options, target),
      )
      return true
    },
  },
  {
    match: (input, _) => input.id === 'candidate-location',
    handle: async (input, _, personalInfo) => {
      const queries = locationSearchQueries(personalInfo)
      if (queries.length === 0) return true
      await fillReactSelect(
        input,
        queries,
        '[id^=react-select-candidate-location-option-]',
        (options) => pickLocationOption(options, personalInfo),
      )
      return true
    },
  },
  {
    // Education comboboxes: school--N, degree--N, discipline--N, start-month--N, end-month--N.
    // N follows the row key. The board renders key 0 only; further keys appear after the
    // education "Add another" button (not the employment one). Claiming every --N id keeps
    // the generic matcher from copying education[0] into a later row.
    match: (input, _) => {
      const field = parseGreenhouseEducationId(input.id)
      return field !== null && field.kind !== 'start-year' && field.kind !== 'end-year'
    },
    handle: (input, _, personalInfo) =>
      enqueueEducationFill(async () => {
        await ensureGreenhouseEducationRows(personalInfo.education?.length ?? 0)
        const field = parseGreenhouseEducationId(input.id)
        if (!field) return
        const education = personalInfo.education?.[field.index]
        if (!education) return
        const live = liveEducationInput(input)
        if (!live) return
        const plan = educationSelectPlan(field, education)
        if (!plan) return
        const current = selectedComboboxLabel(live)
        if (current && plan.pick([current]) === current) return
        await fillReactSelect(
          live,
          plan.queries,
          `[id^=react-select-${live.id}-option-]`,
          (options) => plan.pick(options),
          'greenhouse',
        )
      }),
  },
  {
    // Year inputs are type=number next to the month combobox. The profile string is
    // education.startYear / graduationYear ("2016-09", "May 2016", or a bare year).
    // A bare year fills the year and leaves the month empty.
    match: (input, _) => {
      const field = parseGreenhouseEducationId(input.id)
      return field?.kind === 'start-year' || field?.kind === 'end-year'
    },
    handle: (input, _, personalInfo) =>
      enqueueEducationFill(async () => {
        await ensureGreenhouseEducationRows(personalInfo.education?.length ?? 0)
        const field = parseGreenhouseEducationId(input.id)
        if (!field) return
        const education = personalInfo.education?.[field.index]
        if (!education) return
        const source = field.kind === 'start-year' ? education.startYear : education.graduationYear
        const year = yearFromLooseDate(source)
        if (!year) return
        const live = liveEducationInput(input)
        if (!live) return
        if (live.getAttribute('role') === 'combobox' || live.closest('.select')) {
          const current = selectedComboboxLabel(live)
          if (current === year) return
          await fillReactSelect(
            live,
            year,
            `[id^=react-select-${live.id}-option-]`,
            (options) => pickMonthOption(options, year),
            'greenhouse',
          )
          return
        }
        if (live.value.trim() === year) return
        live.focus()
        setReactInputValue(live, year)
        live.dispatchEvent(new Event('change', { bubbles: true }))
      }),
  },
  {
    // Job-boards employment (boards.greenhouse.io and job-boards embeds).
    // Ids are `${name}-${key}` with key 0, then 1 after "Add another".
    // That is not the education `--0` pattern (start-month--0 stays education).
    // The block renders company, title, start/end month and year, and
    // current-role-{key}_1. It does not render description or location.
    match: (input, _) => parseGreenhouseEmploymentField(input.id) !== null,
    handle: async (input, _, personalInfo) => {
      const field = parseGreenhouseEmploymentField(input.id)
      if (!field) return false
      const experience = personalInfo.experience?.[field.index]
      if (!experience) return true
      const plan = employmentFillPlan(field.kind, experience)
      if (plan.action === 'skip') return true
      if (plan.action === 'check') {
        if (input instanceof HTMLInputElement && input.type === 'checkbox' && !input.checked) {
          input.click()
        }
        return true
      }
      if (plan.action === 'month') {
        await fillReactSelect(input, plan.value, `[id^=react-select-${input.id}-option-]`)
        return true
      }
      await fillNativeInput(input, plan.value)
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('aria-label') === 'Home Address',
    handle: async (input, _, personalInfo) => {
      const stateZip = `${stateSearchValues(personalInfo.state)[0] || ''} ${personalInfo.zip || ''}`.trim()
      const fullAddress = [personalInfo.address, personalInfo.city, stateZip]
        .filter(Boolean)
        .join(', ')
      if (!fullAddress) return true
      await fillReactSelect(input, fullAddress, '[id^=react-select-home-address]')
      return true
    },
  },
  {
    match: (_, fieldText) => isStateQuestion(fieldText),
    handle: async (input, _, personalInfo) => {
      const queries = stateSearchValues(personalInfo.state)
      if (queries.length === 0) return true
      const questionId = input.id.match(/question_(\d+)/)?.[1] || ''
      const optionSelector = questionId
        ? `[id^=react-select-question_${questionId}-option-]`
        : undefined
      await fillReactSelect(input, queries, optionSelector)
      return true
    },
  },
  {
    match: (_, fieldText) =>
      fieldText.includes('legallyauthorized') || fieldText.includes('authorizedtowork'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.workAuthorization) return false
      const isAuthorized = [
        'us_citizen',
        'green_card',
        'work_visa',
        'authorized_no_sponsorship',
      ].includes(personalInfo.workAuthorization)
      const questionId = input.id.match(/question_(\d+)/)?.[1] || ''
      const optionSelector = questionId
        ? `[id^=react-select-question_${questionId}-option-]`
        : undefined
      await fillReactSelect(input, isAuthorized ? 'Yes' : 'No', optionSelector)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('sponsorship'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.workAuthorization && !personalInfo.sponsorshipRequired) return false
      const requiresSponsorship = personalInfo.sponsorshipRequired
        ? personalInfo.sponsorshipRequired === 'Yes'
        : !['us_citizen', 'green_card', 'authorized_no_sponsorship'].includes(
            personalInfo.workAuthorization ?? '',
          )
      const questionId = input.id.match(/question_(\d+)/)?.[1] || ''
      const optionSelector = questionId
        ? `[id^=react-select-question_${questionId}-option-]`
        : undefined
      await fillReactSelect(input, requiresSponsorship ? 'Yes' : 'No', optionSelector)
      return true
    },
  },
  {
    // Custom "country of residence" / "country in which you are located" selects.
    // These are required on many boards and are not the phone #country widget.
    match: (input, fieldText) => isResidenceCountryField(input.id, fieldText),
    handle: async (input, _, personalInfo) => {
      const queries = countrySearchValues(personalInfo.country)
      if (queries.length === 0) return true
      const questionId = input.id.match(/question_(\d+)/)?.[1] || ''
      const optionSelector = questionId
        ? `[id^=react-select-question_${questionId}-option-]`
        : undefined
      await fillReactSelect(input, queries, optionSelector)
      return true
    },
  },
  ...reactSelectEeoFieldHandlers,
]

type EducationEntry = {
  schoolName?: string
  degreeType?: string
  major?: string
  startYear?: string
  graduationYear?: string
}

// Serializes education fills so a formChanged refill (the new --1 row) does not
// type into a combobox the first pass still has open.
let educationFillTail: Promise<void> = Promise.resolve()

function enqueueEducationFill(task: () => Promise<void>): Promise<boolean> {
  const run = educationFillTail.then(task, task).then(
    () => true as const,
    (error) => {
      console.error('[greenhouse education]', error)
      return true as const
    },
  )
  educationFillTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function educationSelectPlan(field: GreenhouseEducationField, education: EducationEntry) {
  if (field.kind === 'school') {
    const queries = schoolSearchValues(education.schoolName)
    if (queries.length === 0) return null
    return { queries, pick: (options: string[]) => pickSchoolOption(options, queries) }
  }
  if (field.kind === 'degree') {
    const queries = degreeSearchValues(education.degreeType)
    if (queries.length === 0) return null
    return { queries, pick: (options: string[]) => pickDegreeOption(options, queries) }
  }
  if (field.kind === 'discipline') {
    const queries = disciplineSearchValues(education.major)
    if (queries.length === 0) return null
    return { queries, pick: (options: string[]) => pickDisciplineOption(options, queries) }
  }
  if (field.kind === 'start-month' || field.kind === 'end-month') {
    const source = field.kind === 'start-month' ? education.startYear : education.graduationYear
    const month = monthNameFromLooseDate(source)
    if (!month) return null
    return { queries: [month], pick: (options: string[]) => pickMonthOption(options, month) }
  }
  return null
}

function liveEducationInput(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): HTMLInputElement | null {
  const candidate = input.isConnected ? input : input.id ? document.getElementById(input.id) : null
  return candidate instanceof HTMLInputElement ? candidate : null
}

function selectedComboboxLabel(input: HTMLElement): string {
  const root = input.closest('.select')
  return root?.querySelector('.select__single-value')?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

// The education section renders one .education--form (key 0). The button inside
// .education--container (class add-another-button, label education.add_another)
// appends key 1, 2, … as school--N / degree--N / discipline--N / start-month--N /
// end-month--N / start-year--N / end-year--N. Employment has its own
// .employment--container button with the same class; this only clicks the education one.
// formChanged sees the new inputs and refills them.
let educationRevealTail: Promise<void> = Promise.resolve()

function ensureGreenhouseEducationRows(profileCount: number): Promise<void> {
  const run = educationRevealTail.then(() => revealGreenhouseEducationRows(profileCount))
  educationRevealTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function revealGreenhouseEducationRows(profileCount: number) {
  let guard = 0
  while (guard < 8) {
    const existing = countGreenhouseEducationRows()
    if (greenhouseEducationRowsToAdd(existing, profileCount) <= 0) return
    const button = greenhouseEducationAddButton()
    if (!button) return
    const before = existing
    button.click()
    const appeared = await waitForEducationRow(before)
    if (!appeared) return
    guard++
  }
}

function countGreenhouseEducationRows(): number {
  const byClass = document.querySelectorAll('.education--container .education--form').length
  if (byClass > 0) return byClass
  let count = 0
  while (count < 8 && greenhouseEducationRowPresent(count)) count++
  return count
}

function greenhouseEducationRowPresent(index: number): boolean {
  return ['school', 'degree', 'discipline', 'start-month', 'start-year', 'end-month', 'end-year'].some(
    (kind) => !!document.getElementById(`${kind}--${index}`),
  )
}

function greenhouseEducationAddButton(): HTMLButtonElement | null {
  const container = document.querySelector('.education--container')
  if (!container) return null
  const byClass = container.querySelector('button.add-another-button')
  if (byClass instanceof HTMLButtonElement) return byClass
  const byLabel = Array.from(container.querySelectorAll('button')).find((button) =>
    /add another/i.test(button.textContent || ''),
  )
  return byLabel instanceof HTMLButtonElement ? byLabel : null
}

function waitForEducationRow(previousCount: number): Promise<boolean> {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (countGreenhouseEducationRows() > previousCount) {
        resolve(true)
        return
      }
      if (Date.now() - start > 1500) {
        resolve(false)
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}
