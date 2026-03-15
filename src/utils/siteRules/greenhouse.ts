// import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
// import { fillReactSelect } from '../../utils/inputHandlers'

// export default function greenhouseConfig(): SiteRule {
//   return {
//     detect: () => window.location.hostname.includes('greenhouse.io'),
//     apply: (input, fieldText, personalInfo) => {
//       for (const { match, handle } of fieldHandlers) {
//         if (match(fieldText, input)) {
//           const result = handle(input, fieldText, personalInfo, '')
//           return result
//         }
//       }
//       return false
//     },
//     formChanged: () => {
//       return false // Greenhouse forms are always loaded with all fields, so we don't need to watch for changes
//     },
//   }
// }

// const fieldHandlers: Array<{
//   match: FieldMatch
//   handle: FieldHandler
// }> = [
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'country'
//     },
//     handle: async function (input, _, personalInfo) {
//       const country = personalInfo.country.replace('_', ' ') || ''
//       await fillReactSelect(input, country, '[id^=react-select-country-option-]')
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'candidate-location'
//     },
//     handle: (input, _, personalInfo) => {
//       const city = personalInfo.city || ''
//       const state = personalInfo.state || ''
//       const country = personalInfo.country.replace('_', ' ') || ''
//       const location = [city, state, country].filter(Boolean).join(', ')
//       setTimeout(
//         () => fillReactSelect(input, location, '[id^=react-select-candidate-location-option-]'),
//         1500,
//       )
//       return true
//     },
//   },
//   {
//     match: (fieldText, input) => {
//       console.log('INPUT: ', input)
//       console.log('FIELD TEXT: ', fieldText)
//       return input.getAttribute('id') === 'school--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.education && personalInfo.education.length > 0) {
//         const schoolName = personalInfo.education[0].schoolName || ''
//         if (schoolName) {
//           ;(async () => {
//             setTimeout(
//               () => fillReactSelect(input, schoolName, '[id^=react-select-school--0-option-]'),
//               2500,
//             )
//           })()
//         }
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'degree--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.education && personalInfo.education.length > 0) {
//         const degreeType = personalInfo.education[0].degreeType || ''
//         if (degreeType) {
//           ;(async () => {
//             setTimeout(
//               () => fillReactSelect(input, degreeType, '[id^=react-select-degree--0-option-]'),
//               3500,
//             )
//           })()
//         }
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'discipline--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.education && personalInfo.education.length > 0) {
//         const major = personalInfo.education[0].major || ''
//         if (major) {
//           ;(async () => {
//             setTimeout(
//               () => fillReactSelect(input, major, '[id^=react-select-discipline--0-option-]'),
//               4500,
//             )
//           })()
//         }
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'start-month--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.experience && personalInfo.experience.length > 0) {
//         const currentExp = personalInfo.experience[0]
//         if (currentExp.startDate) {
//           const startDate = new Date(currentExp.startDate).toLocaleString('default', {
//             month: 'long',
//           })
//           setTimeout(
//             () => fillReactSelect(input, startDate, '[id^=react-select-start-month--0-option-]'),
//             5500,
//           )
//           return true
//         }
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'start-year--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.experience && personalInfo.experience.length > 0) {
//         const currentExp = personalInfo.experience[0]
//         if (currentExp.startDate) {
//           const startDate = new Date(currentExp.startDate).getFullYear().toString()
//           input.value = startDate
//           return true
//         }
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'end-month--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.experience && personalInfo.experience.length > 0) {
//         const currentExp = personalInfo.experience[0]
//         const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
//         const endDate = !isNaN(endDateObj.getTime())
//           ? endDateObj.toLocaleString('default', { month: 'long' })
//           : new Date().toLocaleString('default', { month: 'long' })
//         setTimeout(
//           () => fillReactSelect(input, endDate, '[id^=react-select-end-month--0-option-]'),
//           6500,
//         )
//         return true
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('id') === 'end-year--0'
//     },
//     handle: (input, _, personalInfo) => {
//       if (personalInfo.experience && personalInfo.experience.length > 0) {
//         const currentExp = personalInfo.experience[0]
//         const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
//         const endDate = !isNaN(endDateObj.getTime())
//           ? endDateObj.getFullYear().toString()
//           : new Date().getFullYear().toString()
//         input.value = endDate
//         return true
//       }
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.getAttribute('aria-label') === 'Home Address'
//     },
//     handle: (input, _, personalInfo) => {
//       const address = personalInfo.address || ''
//       const city = personalInfo.city || ''
//       const stateZip = `${personalInfo.state || ''} ${personalInfo.zip || ''}`.trim()
//       const fullAddress = [address, city, stateZip].filter(Boolean).join(', ')
//       setTimeout(() => fillReactSelect(input, fullAddress, '[id^=react-select-home-address]'), 7500)
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('selectyourstate')
//     },
//     handle: (input, _, personalInfo) => {
//       const state = personalInfo.state || ''
//       const rawId = input.getAttribute('id') || ''
//       const questionId = rawId.match(/question_(\d+)/)?.[1] || ''
//       setTimeout(
//         () => fillReactSelect(input, state, `[id^=react-select-question_${questionId}-option-]`),
//         8500,
//       )
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('legallyauthorized') || fieldText.includes('authorizedtowork')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.workAuthorization) return false

//       const isAuthorized = ['us_citizen', 'green_card', 'work_visa'].includes(
//         personalInfo.workAuthorization,
//       )
//       const value = isAuthorized ? 'Yes' : 'No'
//       const id = input.getAttribute('id') || ''
//       const questionId = id.match(/question_(\d+)/)?.[1] || ''

//       setTimeout(
//         () => fillReactSelect(input, value, `[id^=react-select-question_${questionId}-option-]`),
//         9500,
//       )
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('requirecompanysponsorshipforanemploymentvisa')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.workAuthorization) return false

//       const requiresSponsorship = !['us_citizen', 'green_card'].includes(
//         personalInfo.workAuthorization,
//       )
//       const value = requiresSponsorship ? 'Yes' : 'No'
//       const id = input.getAttribute('id') || ''
//       const questionId = id.match(/question_(\d+)/)?.[1] || ''

//       setTimeout(
//         () => fillReactSelect(input, value, `[id^=react-select-question_${questionId}-option-]`),
//         10500,
//       )
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('gendergender')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.gender) return false

//       const genderMap: Record<string, string> = {
//         male: 'Male',
//         female: 'Female',
//         decline: 'Decline To Self Identify',
//       }

//       const value = genderMap[personalInfo.gender] ?? 'Decline To Self Identify'

//       setTimeout(() => fillReactSelect(input, value, `[id^=react-select-gender-option-]`), 11500)
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('hispanicethnicityareyouhispanic')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.raceEthnicity) return false

//       const isHispanic = personalInfo.raceEthnicity === 'hispanic_or_latino'
//       const hispanicValue = isHispanic ? 'Yes' : 'No'

//       setTimeout(() => {
//         fillReactSelect(input, hispanicValue, `[id^=react-select-hispanic_ethnicity-option-]`)

//         // If not hispanic, race field will appear — fill it after a delay
//         if (!isHispanic && personalInfo.raceEthnicity) {
//           const raceMap: Record<string, string> = {
//             white: 'White',
//             black_or_african_american: 'Black or African American',
//             native_hawaiian_or_other_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
//             asian: 'Asian',
//             american_indian_or_alaska_native: 'American Indian or Alaskan Native',
//             two_or_more_races: 'Two or More Races',
//             decline: 'Decline To Self Identify',
//           }
//           const raceValue = raceMap[personalInfo.raceEthnicity] ?? 'Decline To Self Identify'
//           const waitForRaceInput = (retries = 10) => {
//             const raceInput = document.querySelector('#race') as HTMLInputElement | null
//             if (raceInput) {
//               fillReactSelect(raceInput, raceValue, '[id^=react-select-race-option-]')
//             } else if (retries > 0) {
//               setTimeout(() => waitForRaceInput(retries - 1), 300)
//             }
//           }
//           setTimeout(() => waitForRaceInput(), 1500)
//         }
//       }, 12500)

//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('veteranstatusveteranstatus')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.veteranStatus) return false

//       const veteranMap: Record<string, string> = {
//         veteran: 'I identify as one or more of the classifications of a protected veteran',
//         not_a_veteran: 'I am not a protected veteran',
//         decline: "I don't wish to answer",
//       }

//       const value = veteranMap[personalInfo.veteranStatus] ?? "I don't wish to answer"

//       setTimeout(
//         () => fillReactSelect(input, value, `[id^=react-select-veteran_status-option-]`),
//         16500,
//       )
//       return true
//     },
//   },
//   {
//     match: (fieldText, _) => {
//       return fieldText.includes('disabilitystatusdisabilitystatus')
//     },
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.disabilityStatus) return false

//       const disabilityMap: Record<string, string> = {
//         yes: 'Yes, I have a disability, or have had one in the past',
//         no: 'No, I do not have a disability and have not had one in the past',
//         decline: 'I do not want to answer',
//       }

//       const value = disabilityMap[personalInfo.disabilityStatus] ?? 'I do not want to answer'

//       setTimeout(
//         () => fillReactSelect(input, value, `[id^=react-select-disability_status-option-]`),
//         17500,
//       )
//       return true
//     },
//   },
//   {
//     match: (_, input) => {
//       return input.classList.contains('select__input')
//     },
//     handle: () => {
//       // Greenhouse allows plenty of custom dropdowns. We can't adress them all yet. This is to prevent default autofills from triggering
//       return true
//     },
//   },
// ]

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
        if (match(fieldText, input)) {
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
    match: (_, input) => input.getAttribute('id') === 'country',
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.country) return true
      const country = personalInfo.country.replace('_', ' ') || ''
      await fillReactSelect(input, country, '[id^=react-select-country-option-]')
      return true
    },
  },
  {
    match: (_, input) => input.getAttribute('id') === 'candidate-location',
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
    match: (_, input) => input.getAttribute('id') === 'school--0',
    handle: async (input, _, personalInfo) => {
      const schoolName = personalInfo.education?.[0]?.schoolName
      if (!schoolName) return true
      await sleep(500)
      await fillReactSelect(input, schoolName, '[id^=react-select-school--0-option-]')
      return true
    },
  },
  {
    match: (_, input) => input.getAttribute('id') === 'degree--0',
    handle: async (input, _, personalInfo) => {
      const degreeType = personalInfo.education?.[0]?.degreeType
      if (!degreeType) return true
      await sleep(500)
      await fillReactSelect(input, degreeType, '[id^=react-select-degree--0-option-]')
      return true
    },
  },
  {
    match: (_, input) => input.getAttribute('id') === 'discipline--0',
    handle: async (input, _, personalInfo) => {
      const major = personalInfo.education?.[0]?.major
      if (!major) return true
      await sleep(500)
      await fillReactSelect(input, major, '[id^=react-select-discipline--0-option-]')
      return true
    },
  },
  {
    match: (_, input) => input.getAttribute('id') === 'start-month--0',
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
    match: (_, input) => input.getAttribute('id') === 'start-year--0',
    handle: (input, _, personalInfo) => {
      const startDate = personalInfo.experience?.[0]?.startDate
      if (!startDate) return true
      input.value = new Date(startDate).getFullYear().toString()
      return true
    },
  },
  {
    match: (_, input) => input.getAttribute('id') === 'end-month--0',
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
    match: (_, input) => input.getAttribute('id') === 'end-year--0',
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
    match: (_, input) => input.getAttribute('aria-label') === 'Home Address',
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
    match: (fieldText) => fieldText.includes('selectyourstate'),
    handle: async (input, _, personalInfo) => {
      const state = personalInfo.state || ''
      const questionId = input.getAttribute('id')?.match(/question_(\d+)/)?.[1] || ''
      await sleep(500)
      await fillReactSelect(input, state, `[id^=react-select-question_${questionId}-option-]`)
      return true
    },
  },
  {
    match: (fieldText) =>
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
    match: (fieldText) => fieldText.includes('requirecompanysponsorshipforanemploymentvisa'),
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
    match: (fieldText) => fieldText.includes('gendergender'),
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
    match: (fieldText) => fieldText.includes('hispanicethnicityareyouhispanic'),
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
    match: (fieldText) => fieldText.includes('veteranstatusveteranstatus'),
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
    match: (fieldText) => fieldText.includes('disabilitystatusdisabilitystatus'),
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
    match: (_, input) => input.classList.contains('select__input'),
    handle: () => true, // Prevent default autofill on unhandled Greenhouse dropdowns
  },
]
