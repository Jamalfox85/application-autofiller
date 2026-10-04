import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillNativeInput, fillBambooHRSelect } from '../inputHandlers.ts'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'
import {
  assignResumeFile,
  bambooCountryLabel,
  bambooSelectToggle,
  bambooToggleLabel,
  bambooUploadRole,
  describeBambooUpload,
  isBambooCountryControl,
  pickBambooCountryOption,
} from './bamboohrFields.ts'
import { requestBambooSavedResume } from './bamboohrResume.ts'

let bambooHRFormLoaded = false
let lastBambooHRFormSignature = ''

type ResumeLoader = () => Promise<File | null>
let resumeLoader: ResumeLoader = requestBambooSavedResume
let resumeTask: Promise<File | null> | null = null

// Tests pass the already-saved file here. Production reads the resumes bucket.
export function setBambooResumeLoader(loader: ResumeLoader | null) {
  resumeLoader = loader ?? requestBambooSavedResume
  resumeTask = null
}

function savedResume(): Promise<File | null> {
  if (!resumeTask) {
    resumeTask = Promise.resolve()
      .then(() => resumeLoader())
      .catch(() => null)
  }
  return resumeTask
}

export default function bambooHrConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('bamboohr.com'),
    prepareFill: () => {
      resumeTask = null
    },
    apply: async (input, fieldText, personalInfo) => {
      const role = bambooUploadRole(describeBambooUpload(input, fieldText))
      // Cover letter stays empty. Autofill-from-resume is a different control
      // and is not clicked. No saved file means the resume input stays empty.
      if (role === 'cover' || role === 'autofill') return 'skip'
      if (role === 'resume') {
        const file = await savedResume()
        if (!file) return 'skip'
        return (await assignResumeFile(input as HTMLInputElement, file)) ? true : 'skip'
      }

      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    // Job location preselects country (Norway on an Oslo posting). Visit that
    // select anyway so the profile country can replace it.
    includeFilled: (input) => isBambooCountryControl(input),
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
    match: (input) => isBambooCountryControl(input),
    handle: async (input, _, personalInfo) => {
      const label = bambooCountryLabel(personalInfo.country)
      if (!label) return false

      const toggle = bambooSelectToggle(input)
      if (!toggle) return false

      const current = bambooToggleLabel(toggle)
      if (current.toLowerCase() === label.toLowerCase()) return true

      await fillBambooHRSelect(toggle, label, (optionTexts) =>
        pickBambooCountryOption(optionTexts, current, personalInfo.country),
      )
      return true
    },
  },
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
