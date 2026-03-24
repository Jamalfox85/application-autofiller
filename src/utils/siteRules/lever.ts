import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillReactSelect } from '../../utils/inputHandlers'

export default function leverConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('jobs.lever.co'),
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          const result = handle(input, fieldText, personalInfo, '')
          return result
        }
      }
      return false
    },
    formChanged: () => {
      return false // Greenhouse forms are always loaded with all fields, so we don't need to watch for changes
    },
  }
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (input, _) => {
      return input.classList.contains('location-input')
    },
    handle: (input, _, personalInfo) => {
      const city = personalInfo.city || ''
      const state = personalInfo.state || ''
      const country = personalInfo.country.replace('_', ' ') || ''
      input.value = [city, state, country].filter(Boolean).join(', ')
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('data-qa') == 'org-input'
    },
    handle: (input, _, personalInfo) => {
      if (personalInfo.experience && personalInfo.experience.length > 0) {
        const currentExp = personalInfo.experience[0]
        if (currentExp.companyName) {
          input.value = currentExp.companyName
          return true
        }
      }
      return true
    },
  },
  {
    match: (input, _) => {
      return input.classList.contains('candidate-location')
    },
    handle: (input, _, personalInfo) => {
      const country = personalInfo.country || ''
      input.value = country
      return true
    },
  },
]
