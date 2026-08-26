import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillNativeInput, fillBambooHRSelect } from '../inputHandlers.ts'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'

let bambooHRFormLoaded = false
let lastBambooHRFormSignature = ''

export default function bambooHrConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('bamboohr.com'),
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: () => {
      // Only check once when form first loads
      if (!bambooHRFormLoaded) {
        const formInputs = document.querySelectorAll('input[type="text"], textarea, select')

        if (formInputs.length > 0) {
          console.log('BambooHR form appeared')
          bambooHRFormLoaded = true
          return true
        }
        return false
      }

      // After form is loaded, use signature-based detection for changes
      const currentSignature = Array.from(document.querySelectorAll('input, textarea, select'))
        .map((input: any) => `${input.name || input.id || input.type}:${input.value}`)
        .join(',')

      if (currentSignature !== lastBambooHRFormSignature && currentSignature.length > 0) {
        lastBambooHRFormSignature = currentSignature
        return true
      }

      return false
    },
  }
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (_, fieldText) => fieldText.includes('state'),
    handle: async (input, _, personalInfo) => {
      if (!personalInfo.state) return false

      // Find the select button near the input (parent or sibling)
      const selectButton =
        (input as HTMLElement).closest('button') ||
        (input as HTMLElement).parentElement?.querySelector('button')

      if (selectButton && selectButton instanceof HTMLButtonElement) {
        await fillBambooHRSelect(selectButton, personalInfo.state)
        return true
      }

      return false
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
      fillNativeInput(input, requiresSponsorship ? 'Yes' : 'No')
      return true
    },
  },
  ...reactSelectEeoFieldHandlers,
]
