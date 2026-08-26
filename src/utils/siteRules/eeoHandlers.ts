// Shared EEO (gender/race/veteran/disability) field handlers for ATS platforms that render
// EEO questions as react-select dropdowns filled via fillReactSelect (Greenhouse, BambooHR).
import type { FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillReactSelect } from '../inputHandlers.ts'
import { waitForElement } from '../helpers.ts'

export const reactSelectEeoFieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (_, fieldText) => fieldText.includes('gender'),
    handle: async (input, _, personalInfo) => {
      if (personalInfo.eeoAnswersEnabled === false) return false
      const genderMap: Record<string, string[]> = {
        '': ['Decline To Self Identify', "I don't wish to answer"],
        male: ['Male', 'Man'],
        female: ['Female', 'Woman'],
        non_binary: ['Non-binary', 'Nonbinary', 'Genderqueer'],
        self_describe: ["I'd prefer to self-describe", 'Self-Describe', 'Prefer to self-describe'],
      }
      const value = genderMap[personalInfo.gender ?? ''] ?? 'Decline To Self Identify'
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('hispanicethnicityareyouhispanic'),
    handle: async (input, _, personalInfo) => {
      if (personalInfo.eeoAnswersEnabled === false) return false
      const isHispanic = personalInfo.raceEthnicity === 'hispanic_or_latino'
      await fillReactSelect(
        input,
        isHispanic ? 'Yes' : 'No',
        '[id^=react-select-hispanic_ethnicity-option-]',
      )

      if (!isHispanic) {
        const raceMap: Record<string, string[]> = {
          '': ['Decline To Self Identify'],
          white: ['White'],
          black_or_african_american: ['Black or African American'],
          native_hawaiian_or_other_pacific_islander: ['Native Hawaiian or Other Pacific Islander'],
          asian: ['Asian'],
          american_indian_or_alaska_native: ['American Indian or Alaskan Native'],
          two_or_more_races: ['Two or More Races'],
        }
        const raceValue = raceMap[personalInfo.raceEthnicity ?? ''] ?? 'Decline To Self Identify'
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
      if (personalInfo.eeoAnswersEnabled === false) return false

      const raceMap: Record<string, string[]> = {
        '': ['Decline To Self Identify'],
        white: ['White'],
        black_or_african_american: ['Black or African American'],
        native_hawaiian_or_other_pacific_islander: ['Native Hawaiian or Other Pacific Islander'],
        asian: ['Asian'],
        american_indian_or_alaska_native: ['American Indian or Alaskan Native'],
        two_or_more_races: ['Two or More Races'],
      }
      const raceValue = raceMap[personalInfo.raceEthnicity ?? ''] ?? 'Decline To Self Identify'
      await fillReactSelect(input, raceValue)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('veteranstatus'),
    handle: async (input, _, personalInfo) => {
      if (personalInfo.eeoAnswersEnabled === false) return false
      const veteranMap: Record<string, string[]> = {
        '': ["I don't wish to answer", "I don't wish to answer"],
        veteran: [
          'Yes, I am a veteran',
          'I identify as one or more of the classifications of a protected veteran',
        ],
        not_a_veteran: ['No, I am not a veteran', 'I am not a protected veteran'],
      }
      const value = veteranMap[personalInfo.veteranStatus ?? ''] ?? "I don't wish to answer"
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (_, fieldText) => fieldText.includes('disability'),
    handle: async (input, _, personalInfo) => {
      if (personalInfo.eeoAnswersEnabled === false) return false
      const disabilityMap: Record<string, string[]> = {
        '': ['I do not want to answer', "I don't wish to answer"],
        yes: ['Yes', 'Yes, I have a disability, or have had one in the past'],
        no: ['No', 'No, I do not have a disability and have not had one in the past'],
        previously: [
          'Yes, I have a disability, or have had one in the past',
          'I had a disability previously',
        ],
      }
      const value = disabilityMap[personalInfo.disabilityStatus ?? ''] ?? 'I do not want to answer'
      await fillReactSelect(input, value)
      return true
    },
  },
  {
    match: (input, _) => input.classList.contains('select__input'),
    handle: () => true, // Prevent default autofill on unhandled dropdowns
  },
]
