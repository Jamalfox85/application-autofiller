import { PersonalInfo } from '../../types/index.ts'

import greenhouseConfig from './greenhouse.ts'
import workdayConfig from './workday.ts'
import ashbyConfig from './ashby.ts'

export type SiteRule = {
  detect: () => boolean
  onMount?: (personalInfo: PersonalInfo) => void | (() => void) // Optional function that runs when the site is detected. Can return a cleanup function if needed.
  apply: (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    fieldText: string,
    personalInfo: PersonalInfo,
  ) => boolean | Promise<boolean>
  formChanged?: (mutations: MutationRecord[]) => boolean
}

export const siteRules: SiteRule[] = [
  workdayConfig(),
  {
    detect: () => window.location.hostname.includes('jobs.lever.co'),
    apply: (input, fieldText, personalInfo) => {
      if (input.classList.contains('location-input')) {
        const city = personalInfo.city || ''
        const state = personalInfo.state || ''
        const country = personalInfo.country.replace('_', ' ') || ''
        input.value = [city, state, country].filter(Boolean).join(', ')
        return true
      } else if (input.getAttribute('data-qa') == 'org-input') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.companyName) {
            input.value = currentExp.companyName
            return true
          }
        }
      } else if (input.classList.contains('candidate-location')) {
        const country = personalInfo.country || ''
        input.value = country
        return true
      }
      return false
    },
  },
  greenhouseConfig(),
  {
    detect: () => window.location.hostname.includes('icims.com'),
    apply: (input, fieldText, personalInfo) => {
      if (input.getAttribute('autocomplete') == 'email') {
        input.value = personalInfo.email || ''
        return true
      } else if (fieldText.includes('AddressStreet2')) {
        // disable inputting
        return true
      }
      return false
    },
  },
  ashbyConfig(),
]
