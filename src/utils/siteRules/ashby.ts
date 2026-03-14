import type { SiteRule } from './index.ts'
import { fillReactSelect, fillNativeInput } from '../../utils/inputHandlers'

export default function ashbyConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('ashbyhq.com'),
    apply: (input, fieldText, personalInfo) => {
      console.log('FIELDTEXT: ', fieldText, input)
      const fieldLabel =
        input.closest('.ashby-application-form-field-entry')?.querySelector('label')?.textContent ||
        ''
      if (fieldText.includes('systemfieldname')) {
        fillNativeInput(input, `${personalInfo?.firstName} ${personalInfo?.lastName}`.trim())
        return true
      } else if (fieldText.includes('currentemployer?')) {
        if (personalInfo.experience && personalInfo.experience.length > 0) {
          const currentExp = personalInfo.experience[0]
          if (currentExp.companyName) {
            fillNativeInput(input, currentExp.companyName)
            return true
          }
        }
        return true
      } else if (fieldLabel.toLowerCase().includes('location')) {
        const city = personalInfo.city || ''
        const state = personalInfo.state || ''
        const label = city && state ? `${city}, ${state}` : city || state

        setTimeout(() => fillReactSelect(input, label, '[role="option"]'), 500)
      } else if (
        fieldText.includes('authorizedtowork') ||
        fieldText.includes('legallyauthorized')
      ) {
        if (!personalInfo.workAuthorization) {
          return false // skip if we don't have work auth info
        }
        const workAuth = personalInfo.workAuthorization
        const isAuthorized = ['us_citizen', 'green_card', 'work_visa'].includes(workAuth)

        let parentDiv = input.closest('.ashby-application-form-field-entry')
        let buttons = parentDiv?.querySelectorAll('button')
        let yesBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'Yes')
        let noBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'No')

        const targetBtn = isAuthorized ? yesBtn : noBtn
        targetBtn?.click()
        return true
      } else if (fieldText.includes('requiresponsorship')) {
        if (!personalInfo.workAuthorization) {
          return false // skip if we don't have work auth info
        }
        const workAuth = personalInfo.workAuthorization
        const needsSponsorship = ['work_visa', 'need_sponsorship'].includes(workAuth)
        let parentDiv = input.closest('.ashby-application-form-field-entry')
        let buttons = parentDiv?.querySelectorAll('button')
        let yesBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'Yes')
        let noBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'No')

        const targetBtn = needsSponsorship ? yesBtn : noBtn
        targetBtn?.click()
        return true
      } else if (fieldText.includes('eeocgender')) {
        let label = document.querySelector(`label[for="${input.id}"]`)?.textContent || ''
        if (personalInfo.gender == label.toLowerCase().trim()) {
          clickRadio(input as HTMLInputElement)
          return true
        } else if (
          personalInfo.gender?.includes('decline') &&
          label.toLowerCase().includes('decline')
        ) {
          clickRadio(input as HTMLInputElement)
          return true
        }
        return false
      } else if (fieldText.includes('eeocrace')) {
        const raceMap: Record<string, string[]> = {
          hispanic_or_latino: ['hispanic', 'latino'],
          white: ['white'],
          black_or_african_american: ['black', 'african american'],
          native_hawaiian_or_other_pacific_islander: ['hawaiian', 'pacific islander'],
          asian: ['asian'],
          american_indian_or_alaska_native: ['american indian', 'alaska native'],
          two_or_more_races: ['two or more', 'multiple'],
          decline: ['decline'],
        }

        const userRace = personalInfo.raceEthnicity
        const labelText =
          document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase().trim() ||
          ''
        const keywords = raceMap[userRace ?? '']

        if (keywords && keywords.some((keyword) => labelText.includes(keyword))) {
          clickRadio(input as HTMLInputElement)
          return true
        }
        return false
      } else if (fieldText.includes('eeocveteranstatus')) {
        const veteranMap: Record<string, string[]> = {
          veteran: ['i identify', 'protected veteran listed'],
          not_a_veteran: ['not a protected veteran'],
          decline: ['decline'],
        }

        const userVeteran = personalInfo.veteranStatus
        const labelText =
          document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase().trim() ||
          ''
        const keywords = veteranMap[userVeteran ?? '']

        if (keywords && keywords.some((keyword) => labelText.includes(keyword))) {
          clickRadio(input as HTMLInputElement)
          return true
        }
        return false
      } else if (fieldText.includes('eeocdisability')) {
        const disabilityMap: Record<string, string[]> = {
          yes: ['yes, i have'],
          no: ["no, i don't", 'no, i do not'],
          decline: ['do not want to answer'],
        }

        const userDisability = personalInfo.disabilityStatus
        const labelText =
          document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase().trim() ||
          ''
        const keywords = disabilityMap[userDisability ?? '']

        if (keywords && keywords.some((keyword) => labelText.includes(keyword))) {
          clickRadio(input as HTMLInputElement)
          return true
        }
        return false
      }

      return false
    },
    formChanged: (mutations: MutationRecord[]) => {
      return mutations?.some(
        (mutation) =>
          mutation.target instanceof Element &&
          mutation.target.classList.contains('ashby-job-posting-right-pane'),
      )
    },
  }
}

function clickRadio(input: HTMLInputElement) {
  input.click()
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
