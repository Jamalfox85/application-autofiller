import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillReactSelect } from '../../utils/inputHandlers'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function waitForElement<T extends Element>(selector: string, retries = 20): Promise<T | null> {
  return new Promise((resolve) => {
    const check = (retries: number) => {
      const el = document.querySelector<T>(selector)
      if (el) return resolve(el)
      if (retries <= 0) return resolve(null)
      setTimeout(() => check(retries - 1), 300)
    }
    check(retries)
  })
}

export default function greenhouseConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('greenhouse.io'),
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: () => false,
  }
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (input, _) => input.getAttribute('id') === 'country',
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.country) return true
      const country = personalInfo.country.replace('_', ' ') || ''
      await fillReactSelect(input, country, '[id^=react-select-country-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'candidate-location',
    handle: async (input, _, personalInfo) => {
      const location = [
        personalInfo.city,
        personalInfo.state,
        personalInfo.country.replace('_', ' '),
      ]
        .filter(Boolean)
        .join(', ')
      await sleep(500)
      await fillReactSelect(input, location, '[id^=react-select-candidate-location-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'school--0',
    handle: async (input, _, personalInfo) => {
      const schoolName = personalInfo.education?.[0]?.schoolName
      if (!schoolName) return true
      await sleep(500)
      await fillReactSelect(input, schoolName, '[id^=react-select-school--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'degree--0',
    handle: async (input, _, personalInfo) => {
      const degreeType = personalInfo.education?.[0]?.degreeType
      if (!degreeType) return true
      await sleep(500)
      await fillReactSelect(input, degreeType, '[id^=react-select-degree--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'discipline--0',
    handle: async (input, _, personalInfo) => {
      const major = personalInfo.education?.[0]?.major
      if (!major) return true
      await sleep(500)
      await fillReactSelect(input, major, '[id^=react-select-discipline--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'start-month--0',
    handle: async (input, _, personalInfo) => {
      const startDate = personalInfo.experience?.[0]?.startDate
      if (!startDate) return true
      const month = new Date(startDate).toLocaleString('default', { month: 'long' })
      await sleep(500)
      await fillReactSelect(input, month, '[id^=react-select-start-month--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'start-year--0',
    handle: (input, _, personalInfo) => {
      const startDate = personalInfo.experience?.[0]?.startDate
      if (!startDate) return true
      input.value = new Date(startDate).getFullYear().toString()
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'end-month--0',
    handle: async (input, _, personalInfo) => {
      const currentExp = personalInfo.experience?.[0]
      if (!currentExp) return true
      const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
      const month = !isNaN(endDateObj.getTime())
        ? endDateObj.toLocaleString('default', { month: 'long' })
        : new Date().toLocaleString('default', { month: 'long' })
      await sleep(500)
      await fillReactSelect(input, month, '[id^=react-select-end-month--0-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('id') === 'end-year--0',
    handle: (input, _, personalInfo) => {
      const currentExp = personalInfo.experience?.[0]
      if (!currentExp) return true
      const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
      input.value = !isNaN(endDateObj.getTime())
        ? endDateObj.getFullYear().toString()
        : new Date().getFullYear().toString()
      return true
    },
  },
  {
    match: (input, _) => input.getAttribute('aria-label') === 'Home Address',
    handle: async (input, _, personalInfo) => {
      const stateZip = `${personalInfo.state || ''} ${personalInfo.zip || ''}`.trim()
      const fullAddress = [personalInfo.address, personalInfo.city, stateZip]
        .filter(Boolean)
        .join(', ')
      await sleep(500)
      await fillReactSelect(input, fullAddress, '[id^=react-select-home-address]')
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('selectyourstate'),
    handle: async (input, _, personalInfo) => {
      const state = personalInfo.state || ''
      const questionId = input.getAttribute('id')?.match(/question_(\d+)/)?.[1] || ''
      await sleep(500)
      await fillReactSelect(input, state, `[id^=react-select-question_${questionId}-option-]`)
      return true
    },
  },
  {
    match: (_, fieldText) =>
      fieldText.includes('legallyauthorized') || fieldText.includes('authorizedtowork'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.workAuthorization) return false
      const isAuthorized = ['us_citizen', 'green_card', 'work_visa'].includes(
        personalInfo.workAuthorization,
      )
      const questionId = input.getAttribute('id')?.match(/question_(\d+)/)?.[1] || ''
      await sleep(500)
      await fillReactSelect(
        input,
        isAuthorized ? 'Yes' : 'No',
        `[id^=react-select-question_${questionId}-option-]`,
      )
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('requirecompanysponsorshipforanemploymentvisa'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.workAuthorization) return false
      const requiresSponsorship = !['us_citizen', 'green_card'].includes(
        personalInfo.workAuthorization,
      )
      const questionId = input.getAttribute('id')?.match(/question_(\d+)/)?.[1] || ''
      await sleep(500)
      await fillReactSelect(
        input,
        requiresSponsorship ? 'Yes' : 'No',
        `[id^=react-select-question_${questionId}-option-]`,
      )
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('gendergender'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.gender) return false
      const genderMap: Record<string, string> = {
        male: 'Male',
        female: 'Female',
        decline: 'Decline To Self Identify',
      }
      const value = genderMap[personalInfo.gender] ?? 'Decline To Self Identify'
      await sleep(500)
      await fillReactSelect(input, value, '[id^=react-select-gender-option-]')
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('hispanicethnicityareyouhispanic'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.raceEthnicity) return false
      const isHispanic = personalInfo.raceEthnicity === 'hispanic_or_latino'
      await sleep(500)
      await fillReactSelect(
        input,
        isHispanic ? 'Yes' : 'No',
        '[id^=react-select-hispanic_ethnicity-option-]',
      )

      if (!isHispanic) {
        const raceMap: Record<string, string> = {
          white: 'White',
          black_or_african_american: 'Black or African American',
          native_hawaiian_or_other_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
          asian: 'Asian',
          american_indian_or_alaska_native: 'American Indian or Alaskan Native',
          two_or_more_races: 'Two or More Races',
          decline: 'Decline To Self Identify',
        }
        const raceValue = raceMap[personalInfo.raceEthnicity] ?? 'Decline To Self Identify'
        const raceInput = await waitForElement<HTMLInputElement>('#race')
        if (raceInput) {
          await fillReactSelect(raceInput, raceValue, '[id^=react-select-race-option-]')
        }
      }
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('veteranstatusveteranstatus'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.veteranStatus) return false
      const veteranMap: Record<string, string> = {
        veteran: 'I identify as one or more of the classifications of a protected veteran',
        not_a_veteran: 'I am not a protected veteran',
        decline: "I don't wish to answer",
      }
      const value = veteranMap[personalInfo.veteranStatus] ?? "I don't wish to answer"
      await sleep(500)
      await fillReactSelect(input, value, '[id^=react-select-veteran_status-option-]')
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('disabilitystatusdisabilitystatus'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.disabilityStatus) return false
      const disabilityMap: Record<string, string> = {
        yes: 'Yes, I have a disability, or have had one in the past',
        no: 'No, I do not have a disability and have not had one in the past',
        decline: 'I do not want to answer',
      }
      const value = disabilityMap[personalInfo.disabilityStatus] ?? 'I do not want to answer'
      await sleep(500)
      await fillReactSelect(input, value, '[id^=react-select-disability_status-option-]')
      return true
    },
  },
  {
    match: (input, _) => input.classList.contains('select__input'),
    handle: () => true, // Prevent default autofill on unhandled Greenhouse dropdowns
  },
]
