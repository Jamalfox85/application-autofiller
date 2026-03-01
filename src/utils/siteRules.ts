// utils/siteRules.ts
import { RELATIVE_MATCHES } from './relativeMatches'

type SiteRule = {
  detect: () => boolean
  apply: (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    fieldText: string,
    personalInfo: any,
  ) => boolean | Promise<boolean>
  formChanged?: () => string
}

export const siteRules: SiteRule[] = [
  {
    detect: () => window.location.hostname.includes('myworkday'),
    apply: (input, fieldText, personalInfo) => {
      if (
        input.getAttribute('id') == 'name--legalName--firstName' ||
        input.getAttribute('data-automation-id') == 'firstName'
      ) {
        input.value = personalInfo.firstName || ''
        return true
      } else if (
        input.getAttribute('id') == 'name--legalName--middleName' ||
        input.getAttribute('data-automation-id') == 'middleName'
      ) {
        input.value = personalInfo.middleName || '' // Middle name field doesn't currently exist in our personal info form, so this will always be blank for now
        return true
      } else if (
        input.getAttribute('id') == 'name--legalName--lastName' ||
        input.getAttribute('data-automation-id') == 'lastName'
      ) {
        input.value = personalInfo.lastName || ''
        return true
      }
      return false
    },
    formChanged: () => {
      const container = document.querySelector('[data-automation-id="applyFlowPage"]')
      if (!container) return ''

      const inputs = container.querySelectorAll('input, textarea, select')
      return Array.from(inputs)
        .map((input) => `${input.tagName}:${input.name || input.id || input.type}`)
        .join(',')
    },
  },
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
        console.log('INPUTTING COUNTRY: ', country)
        input.value = country
        return true
      }
      console.log('Applying Lever site rule...')
      return false
    },
  },
  {
    detect: () => window.location.hostname.includes('greenhouse.io'),
    apply: async (input, fieldText, personalInfo) => {
      console.log('FIELD TEXT: ', fieldText)
      if (input.getAttribute('id') === 'country') {
        const country = personalInfo.country.replace('_', ' ') || ''
        console.log('INPUTTING COUNTRY: ', country)
        setTimeout(() => fillReactSelect(input, country, 'country'), 500)
      } else if (input.getAttribute('id') === 'candidate-location') {
        const city = personalInfo.city || ''
        const state = personalInfo.state || ''
        const country = personalInfo.country.replace('_', ' ') || ''
        const location = [city, state, country].filter(Boolean).join(', ')
        setTimeout(() => fillReactSelect(input, location, 'candidate-location'), 1500)
      } else if (input.getAttribute('id') === 'school--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const schoolName = personalInfo.education[0].schoolName || ''
          if (schoolName) {
            ;(async () => {
              setTimeout(() => fillReactSelect(input, schoolName, 'school--0'), 2500)
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'degree--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const degreeType = personalInfo.education[0].degreeType || ''
          if (degreeType) {
            ;(async () => {
              setTimeout(() => fillReactSelect(input, degreeType, 'degree--0'), 3500)
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'discipline--0') {
        if (personalInfo.education && personalInfo.education.length > 0) {
          const major = personalInfo.education[0].major || ''
          if (major) {
            ;(async () => {
              setTimeout(() => fillReactSelect(input, major, 'discipline--0'), 4500)
            })()
          }
        }
        return true
      } else if (input.getAttribute('id') === 'start-month--0') {
        console.log('INPUT START MONTH: ', input)
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.startDate) {
            const startDate = new Date(currentExp.startDate).toLocaleString('default', {
              month: 'long',
            })
            setTimeout(() => fillReactSelect(input, startDate, 'start-month--0'), 5500)
            return true
          }
        }
        return true
      } else if (input.getAttribute('id') === 'start-year--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.startDate) {
            const startDate = new Date(currentExp.startDate).getFullYear().toString()
            console.log('INPUTTING START YEAR: ', startDate)
            input.value = startDate
            return true
          }
        }
        return true
      } else if (input.getAttribute('id') === 'end-month--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          const endDateObj = new Date(currentExp.endDate)
          const endDate = !isNaN(endDateObj.getTime())
            ? endDateObj.toLocaleString('default', { month: 'long' })
            : new Date().toLocaleString('default', { month: 'long' })
          console.log('INPUTTING END MONTH: ', endDate)
          setTimeout(() => fillReactSelect(input, endDate, 'end-month--0'), 6500)
          return true
        }
        return true
      } else if (input.getAttribute('id') === 'end-year--0') {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          const endDateObj = new Date(currentExp.endDate)
          const endDate = !isNaN(endDateObj.getTime())
            ? endDateObj.getFullYear().toString()
            : new Date().getFullYear().toString()
          console.log('INPUTTING END YEAR: ', endDate)
          input.value = endDate
          return true
        }
        return true
      } else if (input.getAttribute('aria-label') === 'Home Address') {
        const address = personalInfo.address || ''
        const city = personalInfo.city || ''
        const stateZip = personalInfo.state || '' + ' ' + personalInfo.zip || ''
        const fullAddress = [address, city, stateZip].filter(Boolean).join(', ')
        console.log('INPUTTING ADDRESS: ', fullAddress)
        setTimeout(() => fillReactSelect(input, fullAddress, 'home-address'), 7500)
        return true
      } else if (fieldText.includes('areyoulegallyeligibletoworkin')) {
        console.log('INPUTTING WORK ELIGIBILITY: ', fieldText)
        // temporarily disbling to prevent random text in select
        return true
      } else if (
        fieldText.includes('willyounoworinthefuturerequiresponsorshipforemploymentvisastatus')
      ) {
        console.log('INPUTTING VISA SPONSORSHIP: ', fieldText)
        // temporarily disbling to prevent random text in select
        return true
      }
      return false
    },
  },
]

const fillReactSelect = (
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  selectId: string,
): void => {
  const handleBlur = (e: Event) => {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  input.addEventListener('blur', handleBlur, true)

  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  input.focus()
  input.dispatchEvent(new Event('focus', { bubbles: true }))

  for (const char of value) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeInputValueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))

  const waitForOptions = (retries = 10) => {
    const options = document.querySelectorAll(`[id^="react-select-${selectId}-option-"]`)
    if (options.length > 0) {
      const match = Array.from(options).find(
        (el) => el.textContent?.toLowerCase() === value.toLowerCase(),
      ) as HTMLElement | undefined
      const target = (match ||
        document.querySelector(`#react-select-${selectId}-option-0`)) as HTMLElement
      target?.click()
      input.removeEventListener('blur', handleBlur, true)
    } else if (retries > 0) {
      setTimeout(() => waitForOptions(retries - 1), 200)
    } else {
      input.removeEventListener('blur', handleBlur, true)
    }
  }
  waitForOptions()
}
