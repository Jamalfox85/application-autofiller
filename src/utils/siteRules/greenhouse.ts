import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillReactSelect } from '../../utils/inputHandlers'
import { sleep } from '../helpers.ts'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'

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
      const isAuthorized = ['us_citizen', 'green_card', 'work_visa', 'authorized_no_sponsorship'].includes(
        personalInfo.workAuthorization,
      )
      const questionId = input.getAttribute('id')?.match(/question_(\d+)/)?.[1] || ''
      await sleep(500)
      console.log('Filling legal authorization question with:', isAuthorized ? 'Yes' : 'No')
      await fillReactSelect(
        input,
        isAuthorized ? 'Yes' : 'No',
        `[id^=react-select-question_${questionId}-option-]`,
      )
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
  ...reactSelectEeoFieldHandlers,
]
