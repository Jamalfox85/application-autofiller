import type { SiteRule } from './index.ts'
import { fillReactSelect } from '../../utils/inputHandlers'

export default function greenhouseConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('greenhouse.io'),
    apply: async (input, fieldText, personalInfo) => {
      //   console.log('INPUT: ', input, 'FIELD TEXT: ', fieldText) // --- IGNORE ---
      if (input.getAttribute('id') === 'country') {
        const country = personalInfo.country.replace('_', ' ') || ''
        setTimeout(() => fillReactSelect(input, country, 'react-select-country-option-'), 500)
      } else if (input.getAttribute('id') === 'candidate-location') {
        const city = personalInfo.city || ''
        const state = personalInfo.state || ''
        const country = personalInfo.country.replace('_', ' ') || ''
        const location = [city, state, country].filter(Boolean).join(', ')
        setTimeout(
          () => fillReactSelect(input, location, '[id^=react-select-candidate-location-option-]'),
          1500,
        )
      } else if (input.getAttribute('id') === 'school--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const schoolName = personalInfo.education[0].schoolName || ''
          if (schoolName) {
            ;(async () => {
              setTimeout(
                () => fillReactSelect(input, schoolName, '[id^=react-select-school--0-option-]'),
                2500,
              )
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'degree--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const degreeType = personalInfo.education[0].degreeType || ''
          if (degreeType) {
            ;(async () => {
              setTimeout(
                () => fillReactSelect(input, degreeType, '[id^=react-select-degree--0-option-]'),
                3500,
              )
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'discipline--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const major = personalInfo.education[0].major || ''
          if (major) {
            ;(async () => {
              setTimeout(
                () => fillReactSelect(input, major, '[id^=react-select-discipline--0-option-]'),
                4500,
              )
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'start-month--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.startDate) {
            const startDate = new Date(currentExp.startDate).toLocaleString('default', {
              month: 'long',
            })
            setTimeout(
              () => fillReactSelect(input, startDate, '[id^=react-select-start-month--0-option-]'),
              5500,
            )
            return true
          }
        }
        return true
      } else if (input.getAttribute('id') === 'start-year--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.startDate) {
            const startDate = new Date(currentExp.startDate).getFullYear().toString()
            input.value = startDate
            return true
          }
        }
        return true
      } else if (input.getAttribute('id') === 'end-month--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
          const endDate = !isNaN(endDateObj.getTime())
            ? endDateObj.toLocaleString('default', { month: 'long' })
            : new Date().toLocaleString('default', { month: 'long' })
          setTimeout(
            () => fillReactSelect(input, endDate, '[id^=react-select-end-month--0-option-]'),
            6500,
          )
          return true
        }
        return true
      } else if (input.getAttribute('id') === 'end-year--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          const endDateObj = currentExp.endDate ? new Date(currentExp.endDate) : new Date()
          const endDate = !isNaN(endDateObj.getTime())
            ? endDateObj.getFullYear().toString()
            : new Date().getFullYear().toString()
          input.value = endDate
          return true
        }
        return true
      } else if (input.getAttribute('aria-label') === 'Home Address') {
        const address = personalInfo.address || ''
        const city = personalInfo.city || ''
        const stateZip = personalInfo.state || '' + ' ' + personalInfo.zip || ''
        const fullAddress = [address, city, stateZip].filter(Boolean).join(', ')
        setTimeout(
          () => fillReactSelect(input, fullAddress, '[id^=react-select-home-address]'),
          7500,
        )
        return true
      } else if (fieldText.includes('areyoulegallyeligibletoworkin')) {
        // temporarily disbling to prevent random text in select
        return true
      } else if (fieldText.includes('requiresponsorshipforemploymentvisastatus')) {
        // temporarily disbling to prevent random text in select
        return true
      } else if (fieldText.includes('salaryexpectations')) {
        if (personalInfo.desiredSalary) {
          input.value = personalInfo.desiredSalary.toString()
          return true
        }
      }
      return false
    },
  }
}
