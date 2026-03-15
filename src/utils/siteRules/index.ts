import { SiteRule } from '../../types/index.ts'

import workdayConfig from './workday.ts'
import leverConfig from './lever.ts'
import greenhouseConfig from './greenhouse.ts'
import ashbyConfig from './ashby.ts'

export const siteRules: SiteRule[] = [
  workdayConfig(),
  leverConfig(),
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
