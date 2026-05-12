import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillReactSelect, fillNativeInput, fillBambooHRSelect } from '../inputHandlers.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let bambooHRFormLoaded = false
let lastBambooHRFormSignature = ''

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

export default function bambooHrConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('bamboohr.com'),
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: () => {
      // Only check once when form first loads
      if (!bambooHRFormLoaded) {
        const formInputs = document.querySelectorAll('input[type="text"], textarea, select')

        if (formInputs.length > 0) {
          console.log('BambooHR form appeared')
          bambooHRFormLoaded = true
          return true
        }
        return false
      }

      // After form is loaded, use signature-based detection for changes
      const currentSignature = Array.from(document.querySelectorAll('input, textarea, select'))
        .map((input: any) => `${input.name || input.id || input.type}:${input.value}`)
        .join(',')

      if (currentSignature !== lastBambooHRFormSignature && currentSignature.length > 0) {
        lastBambooHRFormSignature = currentSignature
        return true
      }

      return false
    },
  }
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (_, fieldText) => fieldText.includes('state'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.state) return false

      // Find the select button near the input (parent or sibling)
      const selectButton =
        (input as HTMLElement).closest('button') ||
        (input as HTMLElement).parentElement?.querySelector('button')

      if (selectButton && selectButton instanceof HTMLButtonElement) {
        await fillBambooHRSelect(selectButton, personalInfo.state)
        return true
      }

      return false
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('sponsorship'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.workAuthorization) return false
      const requiresSponsorship = !['us_citizen', 'green_card'].includes(
        personalInfo.workAuthorization,
      )
      fillNativeInput(input, requiresSponsorship ? 'Yes' : 'No')
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('gender'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.gender) return false
      const genderMap: Record<string, string[]> = {
        male: ['Male', 'Man'],
        female: ['Female', 'Woman'],
        decline: ['Decline To Self Identify', "I don't wish to answer"],
      }
      const value = genderMap[personalInfo.gender] ?? 'Decline To Self Identify'
      //   await sleep(500)
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('hispanicethnicityareyouhispanic'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.raceEthnicity) return false
      const isHispanic = personalInfo.raceEthnicity === 'hispanic_or_latino'
      //   await sleep(500)
      await fillReactSelect(
        input,
        isHispanic ? 'Yes' : 'No',
        '[id^=react-select-hispanic_ethnicity-option-]',
      )

      if (!isHispanic) {
        const raceMap: Record<string, string[]> = {
          white: ['White'],
          black_or_african_american: ['Black or African American'],
          native_hawaiian_or_other_pacific_islander: ['Native Hawaiian or Other Pacific Islander'],
          asian: ['Asian'],
          american_indian_or_alaska_native: ['American Indian or Alaskan Native'],
          two_or_more_races: ['Two or More Races'],
          decline: ['Decline To Self Identify'],
        }
        const raceValue = raceMap[personalInfo.raceEthnicity] ?? 'Decline To Self Identify'
        const raceInput = await waitForElement<HTMLInputElement>('#race')
        if (raceInput) {
          await fillReactSelect(raceInput, raceValue)
        }
      }
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('identifymyraceas'),
    handle: async (input, _, personalInfo) => {
      console.log('FILLING RACE AND ETH')
      if (!personalInfo.raceEthnicity) return false
      //   await sleep(500)

      const raceMap: Record<string, string[]> = {
        white: ['White'],
        black_or_african_american: ['Black or African American'],
        native_hawaiian_or_other_pacific_islander: ['Native Hawaiian or Other Pacific Islander'],
        asian: ['Asian'],
        american_indian_or_alaska_native: ['American Indian or Alaskan Native'],
        two_or_more_races: ['Two or More Races'],
        decline: ['Decline To Self Identify'],
      }
      const raceValue = raceMap[personalInfo.raceEthnicity] ?? 'Decline To Self Identify'
      await fillReactSelect(input, raceValue)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('veteranstatus'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.veteranStatus) return false
      const veteranMap: Record<string, string[]> = {
        veteran: [
          'Yes, I am a veteran',
          'I identify as one or more of the classifications of a protected veteran',
        ],
        not_a_veteran: ['No, I am not a veteran', 'I am not a protected veteran'],
        decline: ["I don't wish to answer", "I don't wish to answer"],
      }
      const value = veteranMap[personalInfo.veteranStatus] ?? "I don't wish to answer"
      //   await sleep(500)
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('disability'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.disabilityStatus) return false
      const disabilityMap: Record<string, string[]> = {
        yes: ['Yes', 'Yes, I have a disability, or have had one in the past'],
        no: ['No', 'No, I do not have a disability and have not had one in the past'],
        decline: ['I do not want to answer', "I don't wish to answer"],
      }
      const value = disabilityMap[personalInfo.disabilityStatus] ?? 'I do not want to answer'
      //   await sleep(500)
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (input, _) => input.classList.contains('select__input'),
    handle: () => true, // Prevent default autofill on unhandled Greenhouse dropdowns
  },
]
