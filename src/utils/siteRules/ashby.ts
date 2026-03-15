import type { SiteRule } from '../../types/index.ts'
import { fillReactSelect, fillNativeInput } from '../../utils/inputHandlers'

export default function ashbyConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('ashbyhq.com'),
    apply: (input, fieldText, personalInfo) => {
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

// import type { SiteRule } from './index.ts'
// import { fillReactSelect, fillNativeInput } from '../../utils/inputHandlers'

// type PersonalInfo = Record<string, any>

// // --- Helpers ---

// function clickRadio(input: HTMLInputElement) {
//   input.click()
//   input.dispatchEvent(new Event('change', { bubbles: true }))
//   input.dispatchEvent(new Event('input', { bubbles: true }))
// }

// function clickYesNo(
//   input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
//   shouldClickYes: boolean,
// ) {
//   const parentDiv = input.closest('.ashby-application-form-field-entry')
//   const buttons = parentDiv?.querySelectorAll('button')
//   const yesBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'Yes')
//   const noBtn = Array.from(buttons ?? []).find((btn) => btn.textContent?.trim() === 'No')
//   const target = shouldClickYes ? yesBtn : noBtn
//   target?.click()
// }

// function getLabelText(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
//   return (
//     document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase().trim() || ''
//   )
// }

// function matchFromMap(
//   map: Record<string, string[]>,
//   userValue: string | undefined,
//   labelText: string,
// ) {
//   const keywords = map[userValue ?? '']
//   return keywords?.some((keyword) => labelText.includes(keyword)) ?? false
// }

// // --- EEO Map ---

// const EEO_MAPS = {
//   eeocgender: null, // handled separately due to exact match logic
//   eeocrace: {
//     hispanic_or_latino: ['hispanic', 'latino'],
//     white: ['white'],
//     black_or_african_american: ['black', 'african american'],
//     native_hawaiian_or_other_pacific_islander: ['hawaiian', 'pacific islander'],
//     asian: ['asian'],
//     american_indian_or_alaska_native: ['american indian', 'alaska native'],
//     two_or_more_races: ['two or more', 'multiple'],
//     decline: ['decline'],
//   },
//   eeocveteranstatus: {
//     veteran: ['i identify', 'protected veteran listed'],
//     not_a_veteran: ['not a protected veteran'],
//     decline: ['decline'],
//   },
//   eeocdisability: {
//     yes: ['yes, i have'],
//     no: ["no, i don't", 'no, i do not'],
//     decline: ['do not want to answer'],
//   },
// } as const

// // --- Field Handlers ---

// type FieldHandler = (
//   input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
//   fieldText: string,
//   personalInfo: PersonalInfo,
//   fieldLabel: string,
// ) => boolean | void

// const fieldHandlers: Array<{
//   match: (fieldText: string) => boolean
//   handle: FieldHandler
// }> = [
//   {
//     match: (f) => f.includes('systemfieldname'),
//     handle: (input, _, personalInfo) => {
//       fillNativeInput(input, `${personalInfo.firstName} ${personalInfo.lastName}`.trim())
//       return true
//     },
//   },
//   {
//     match: (f) => f.includes('currentemployer?'),
//     handle: (input, _, personalInfo) => {
//       const companyName = personalInfo.experience?.[0]?.companyName
//       if (companyName) fillNativeInput(input, companyName)
//       return true
//     },
//   },
//   {
//     match: (_, __, ___, fieldLabel) => fieldLabel.toLowerCase().includes('location'),
//     handle: (input, _, personalInfo) => {
//       const { city = '', state = '' } = personalInfo
//       const label = city && state ? `${city}, ${state}` : city || state
//       setTimeout(() => fillReactSelect(input, label, '[role="option"]'), 500)
//       return true
//     },
//   },
//   {
//     match: (f) => f.includes('authorizedtowork') || f.includes('legallyauthorized'),
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.workAuthorization) return false
//       const isAuthorized = ['us_citizen', 'green_card', 'work_visa'].includes(
//         personalInfo.workAuthorization,
//       )
//       clickYesNo(input, isAuthorized)
//       return true
//     },
//   },
//   {
//     match: (f) => f.includes('requiresponsorship'),
//     handle: (input, _, personalInfo) => {
//       if (!personalInfo.workAuthorization) return false
//       const needsSponsorship = ['work_visa', 'need_sponsorship'].includes(
//         personalInfo.workAuthorization,
//       )
//       clickYesNo(input, !needsSponsorship)
//       return true
//     },
//   },
//   {
//     match: (f) => f.includes('eeocgender'),
//     handle: (input, _, personalInfo) => {
//       const labelText = getLabelText(input)
//       const gender = personalInfo.gender
//       const isMatch =
//         gender === labelText ||
//         (gender?.includes('decline') && labelText.includes('decline'))
//       if (isMatch) {
//         clickRadio(input as HTMLInputElement)
//         return true
//       }
//       return false
//     },
//   },
//   ...(['eeocrace', 'eeocveteranstatus', 'eeocdisability'] as const).map((key) => ({
//     match: (f: string) => f.includes(key),
//     handle: (
//       input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
//       _: string,
//       personalInfo: PersonalInfo,
//     ) => {
//       const map = EEO_MAPS[key] as Record<string, string[]>
//       const userValue =
//         key === 'eeocrace'
//           ? personalInfo.raceEthnicity
//           : key === 'eeocveteranstatus'
//             ? personalInfo.veteranStatus
//             : personalInfo.disabilityStatus

//       if (matchFromMap(map, userValue, getLabelText(input))) {
//         clickRadio(input as HTMLInputElement)
//         return true
//       }
//       return false
//     },
//   })),
// ]

// // --- Site Rule ---

// export default function ashbyConfig(): SiteRule {
//   return {
//     detect: () => window.location.hostname.includes('ashbyhq.com'),
//     apply: (input, fieldText, personalInfo) => {
//       const fieldLabel =
//         input.closest('.ashby-application-form-field-entry')?.querySelector('label')
//           ?.textContent || ''

//       for (const { match, handle } of fieldHandlers) {
//         if (match(fieldText, fieldText, personalInfo, fieldLabel)) {
//           const result = handle(input, fieldText, personalInfo, fieldLabel)
//           if (result !== undefined) return result
//         }
//       }

//       return false
//     },
//     formChanged: (mutations: MutationRecord[]) => {
//       return mutations?.some(
//         (mutation) =>
//           mutation.target instanceof Element &&
//           mutation.target.classList.contains('ashby-job-posting-right-pane'),
//       )
//     },
//   }
// }
