// Shared EEO (gender/race/veteran/disability) field handlers for dropdowns filled as
// react-select comboboxes (job boards and BambooHR) or native <select>s.
// An empty saved answer stays empty. When the control requires a choice, the decline
// option is selected — that is the "prefer not to say" line in Demographics. A miss
// returns 'skip' so the rest of the fill still finishes.
import type { FieldMatch, FieldHandler, PersonalInfo } from '../../types/index.ts'
import { fillStickyReactSelect } from '../inputHandlers.ts'
import { waitForElement } from '../helpers.ts'

export const EEO_DECLINE_LABELS = [
  "I don't wish to answer",
  'I do not want to answer',
  'Decline To Self Identify',
  'Decline to self-identify',
  'Prefer not to say',
  'Prefer not to answer',
]

type EeoInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function optionSelector(input: { id?: string }): string | undefined {
  const id = input.id || ''
  if (!/^[\w:-]+$/.test(id)) return undefined
  return `[id^="react-select-${id}-option-"]`
}

function elementRequiresChoice(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false
  const el = input as {
    getAttribute?: (name: string) => string | null
    hasAttribute?: (name: string) => boolean
    closest?: (selector: string) => { querySelector?: (selector: string) => unknown } | null
    id?: string
    ownerDocument?: {
      querySelector?: (selector: string) => {
        textContent?: string | null
        querySelector?: (selector: string) => unknown
      } | null
    }
  }
  try {
    if (el.getAttribute?.('aria-required') === 'true') return true
    if (el.hasAttribute?.('required')) return true
    const root = el.closest?.('.select, .select__container')
    if (root?.querySelector?.('input[required], select[required], textarea[required]')) return true
    const id = el.id
    if (id && /^[\w:-]+$/.test(id)) {
      const label = el.ownerDocument?.querySelector?.(`label[for="${id}"]`)
      if (label?.querySelector?.('[aria-hidden="true"]') && (label.textContent || '').includes('*')) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

async function fillLabels(input: EeoInput, labels: string[]): Promise<boolean | 'skip'> {
  const ok = await fillStickyReactSelect(input, labels, optionSelector(input))
  return ok ? true : 'skip'
}

async function fillAnswer(
  input: EeoInput,
  personalInfo: PersonalInfo,
  stored: string | undefined,
  labelsFor: (value: string) => string[] | null,
): Promise<boolean | 'skip'> {
  if (personalInfo.eeoAnswersEnabled === false) return 'skip'
  const value = (stored || '').trim()
  if (!value) {
    if (!elementRequiresChoice(input)) return 'skip'
    return fillLabels(input, EEO_DECLINE_LABELS)
  }
  const labels = labelsFor(value)
  if (!labels || labels.length === 0) return 'skip'
  return fillLabels(input, labels)
}

function genderLabels(value: string): string[] | null {
  const map: Record<string, string[]> = {
    male: ['Male', 'Man'],
    female: ['Female', 'Woman'],
    non_binary: ['Non-binary', 'Nonbinary', 'Genderqueer', 'Non-binary or third gender'],
    self_describe: ["I'd prefer to self-describe", 'Self-describe', 'Prefer to self-describe'],
  }
  return map[value] ?? null
}

function raceLabels(value: string): string[] | null {
  const map: Record<string, string[]> = {
    hispanic_or_latino: ['Hispanic or Latino', 'Hispanic, Latine or of Spanish Origin', 'Hispanic'],
    white: ['White', 'White or European'],
    black_or_african_american: ['Black or African American', 'Black or of African descent'],
    native_hawaiian_or_other_pacific_islander: [
      'Native Hawaiian or Other Pacific Islander',
      'Hawaiian or Pacific Islander',
    ],
    asian: ['Asian'],
    american_indian_or_alaska_native: [
      'American Indian or Alaska Native',
      'American Indian or Alaskan Native',
      'Indigenous, American Indian or Alaska Native',
    ],
    two_or_more_races: ['Two or More Races', 'Two or more races'],
  }
  return map[value] ?? null
}

function veteranLabels(value: string): string[] | null {
  const map: Record<string, string[]> = {
    veteran: [
      'I identify as one or more of the classifications of a protected veteran',
      'Yes, I am a veteran',
    ],
    not_a_veteran: ['I am not a protected veteran', 'No, I am not a veteran'],
  }
  return map[value] ?? null
}

function disabilityLabels(value: string): string[] | null {
  const map: Record<string, string[]> = {
    yes: ['Yes, I have a disability, or have had one in the past', 'Yes, I have a disability', 'Yes'],
    no: [
      'No, I do not have a disability and have not had one in the past',
      'No, I do not have a disability',
      'No',
    ],
    previously: [
      'Yes, I have a disability, or have had one in the past',
      'I had a disability previously',
    ],
  }
  return map[value] ?? null
}

function isRaceDropdown(fieldText: string): boolean {
  if (fieldText.includes('hispanicethnicityareyouhispanic')) return false
  return fieldText.includes('race') || fieldText.includes('ethnic')
}

export const reactSelectEeoFieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (_, fieldText) => fieldText.includes('gender'),
    handle: (input, _, personalInfo) => fillAnswer(input, personalInfo, personalInfo.gender, genderLabels),
  },
  {
    // "Are you Hispanic/Latino?" is Yes / No / Decline. Yes records Hispanic or
    // Latino and hides the race list. No reveals #race ("Please identify your race").
    // A click that only types the word is wiped back to Select…, so this shares the
    // sticky commit used by the other demographic menus.
    match: (_, fieldText) => fieldText.includes('hispanicethnicityareyouhispanic'),
    handle: async (input, _, personalInfo) => {
      if (personalInfo.eeoAnswersEnabled === false) return 'skip'
      const race = (personalInfo.raceEthnicity || '').trim()
      if (!race) return fillAnswer(input, personalInfo, '', () => null)
      const isHispanic = race === 'hispanic_or_latino'
      const picked = await fillLabels(input, isHispanic ? ['Yes'] : ['No'])
      if (isHispanic || picked !== true) return picked
      const raceInput = await waitForElement<HTMLInputElement>('#race')
      if (!raceInput) return 'skip'
      const labels = raceLabels(race)
      if (!labels) return 'skip'
      const raceOk = await fillStickyReactSelect(raceInput, labels, optionSelector(raceInput))
      return raceOk ? true : 'skip'
    },
  },
  {
    match: (_, fieldText) => isRaceDropdown(fieldText),
    handle: (input, _, personalInfo) =>
      fillAnswer(input, personalInfo, personalInfo.raceEthnicity, raceLabels),
  },
  {
    match: (_, fieldText) => fieldText.includes('veteranstatus'),
    handle: (input, _, personalInfo) =>
      fillAnswer(input, personalInfo, personalInfo.veteranStatus, veteranLabels),
  },
  {
    match: (_, fieldText) => fieldText.includes('disability'),
    handle: (input, _, personalInfo) =>
      fillAnswer(input, personalInfo, personalInfo.disabilityStatus, disabilityLabels),
  },
  {
    match: (input, _) => input.classList.contains('select__input'),
    handle: () => 'skip', // Own unhandled dropdowns without counting them as filled
  },
]
