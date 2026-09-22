import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { detectAts } from '../ats.ts'
import { fillNativeInput, fillReactSelect } from '../../utils/inputHandlers'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'
import {
  dialingCodeSearchValues,
  isGreenhousePhoneDialingCodeField,
  locationSearchQueries,
  phoneDialingCodeTarget,
  pickDialingCodeOption,
  pickLocationOption,
} from './greenhouseFields.ts'
import {
  countrySearchValues,
  degreeSearchValues,
  disciplineSearchValues,
  isResidenceCountryField,
  isStateQuestion,
  monthNameFromLooseDate,
  schoolSearchValues,
  stateSearchValues,
  yearFromLooseDate,
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
    match: (input, _) => input.id === 'school--0',
    handle: async (input, _, personalInfo) => {
      const queries = schoolSearchValues(personalInfo.education?.[0]?.schoolName)
      if (queries.length === 0) return true
      await fillReactSelect(input, queries, '[id^=react-select-school--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.id === 'degree--0',
    handle: async (input, _, personalInfo) => {
      const queries = degreeSearchValues(personalInfo.education?.[0]?.degreeType)
      if (queries.length === 0) return true
      await fillReactSelect(input, queries, '[id^=react-select-degree--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.id === 'discipline--0',
    handle: async (input, _, personalInfo) => {
      const queries = disciplineSearchValues(personalInfo.education?.[0]?.major)
      if (queries.length === 0) return true
      await fillReactSelect(input, queries, '[id^=react-select-discipline--0-option-]')
      return true
    },
  },
  {
    // Education month/year. These ids sit next to school--0. The profile stores
    // education years (and sometimes a month inside that string), not experience dates.
    match: (input, _) => input.id === 'start-month--0',
    handle: async (input, _, personalInfo) => {
      const month = monthNameFromLooseDate(personalInfo.education?.[0]?.startYear)
      if (!month) return true
      await fillReactSelect(input, month, '[id^=react-select-start-month--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.id === 'start-year--0',
    handle: async (input, _, personalInfo) => {
      const year = yearFromLooseDate(personalInfo.education?.[0]?.startYear)
      if (!year) return true
      await fillNativeInput(input, year)
      return true
    },
  },
  {
    match: (input, _) => input.id === 'end-month--0',
    handle: async (input, _, personalInfo) => {
      const month = monthNameFromLooseDate(personalInfo.education?.[0]?.graduationYear)
      if (!month) return true
      await fillReactSelect(input, month, '[id^=react-select-end-month--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.id === 'end-year--0',
    handle: async (input, _, personalInfo) => {
      const year = yearFromLooseDate(personalInfo.education?.[0]?.graduationYear)
      if (!year) return true
      await fillNativeInput(input, year)
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
