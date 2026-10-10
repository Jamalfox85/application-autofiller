import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillNativeInput, fillBambooHRSelect, setReactInputValue } from '../inputHandlers.ts'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'
import {
  assignResumeFile,
  bambooCountryLabel,
  bambooSelectToggle,
  bambooToggleLabel,
  bambooUploadRole,
  describeBambooUpload,
  isBambooCountryControl,
  isBambooStateControl,
  pickBambooCountryOption,
  pickBambooStateOption,
} from './bamboohrFields.ts'
import { requestBambooSavedResume } from './bamboohrResume.ts'

let bambooHRFormLoaded = false
let lastBambooHRFormSignature = ''
// Opening a Fabric menu mutates the form. A refill that starts while the country
// menu is still open types the state into that menu and flips the country.
let bambooAddressBusy = 0
let bambooRefillPending = false

type ResumeLoader = () => Promise<File | null>
let resumeLoader: ResumeLoader = requestBambooSavedResume
let resumeTask: Promise<File | null> | null = null

// Tests pass the already-saved file here. Production reads the resumes bucket.
export function setBambooResumeLoader(loader: ResumeLoader | null) {
  resumeLoader = loader ?? requestBambooSavedResume
  resumeTask = null
}

function isReactSelectControl(input: Element): boolean {
  return (
    input.classList.contains('select__input') ||
    input.getAttribute('role') === 'combobox' ||
    input.getAttribute('aria-autocomplete') === 'list' ||
    !!input.closest('.select, .select__control')
  )
}

function sameBambooLabel(current: string, wanted: string): boolean {
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  return norm(current) === norm(wanted) && norm(wanted) !== ''
}

function isBambooTextControl(input: Element): input is HTMLInputElement | HTMLTextAreaElement {
  if (input.tagName === 'TEXTAREA') return true
  if (input.tagName !== 'INPUT') return false
  const type = (input.getAttribute('type') || 'text').toLowerCase()
  return type === '' || type === 'text' || type === 'search' || type === 'tel'
}

// Province on this form is a text input. Changing country drops whatever was
// just written there, so a later write has to put the profile state back.
function writeBambooProvinceText(field: HTMLInputElement | HTMLTextAreaElement, state: string): boolean {
  if (sameBambooLabel(field.value, state)) return true
  setReactInputValue(field, state)
  const View = field.ownerDocument?.defaultView
  const EventCtor = View?.Event ?? Event
  field.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return sameBambooLabel(field.value, state)
}

function bambooRegionField(doc: Document) {
  return doc.querySelector(
    'input[name="state.value"], textarea[name="state.value"], select[name="state.value"]',
  )
}

function bambooRegionSnapshot(doc: Document | null) {
  if (!doc) return null
  const field = bambooRegionField(doc)
  if (!field) return null
  const toggle = bambooSelectToggle(field)
  const shown = toggle ? bambooToggleLabel(toggle) : (field as HTMLInputElement).value || ''
  return { key: `${field.tagName}:${(field as HTMLElement).id}`, shown }
}

// Country selection swaps a Province text box for a State menu, or clears the
// text that was just written. Wait until that control settles, then fill it.
async function fillBambooRegionAfterCountry(
  doc: Document | null,
  state: string,
  before: { key: string; shown: string } | null,
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const now = bambooRegionSnapshot(doc)
    if (now && before && (now.key !== before.key || now.shown !== before.shown)) break
    if (!before && now) break
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  await fillBambooRegion(doc, state)
}

async function fillBambooRegion(doc: Document | null, state: string) {
  const wanted = state.trim()
  if (!doc || !wanted) return
  const field = bambooRegionField(doc)
  if (!field || isBambooCountryControl(field)) return
  if (isBambooTextControl(field)) {
    writeBambooProvinceText(field, wanted)
    return
  }
  const toggle = bambooSelectToggle(field)
  if (!toggle) return
  if (sameBambooLabel(bambooToggleLabel(toggle), wanted)) return
  await fillBambooHRSelect(toggle, wanted, (optionTexts) => pickBambooStateOption(optionTexts, wanted))
}

function queueBambooRefill() {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  const marker = document.createComment('gofillr-bamboo')
  body.appendChild(marker)
  marker.remove()
}

async function withBambooAddressFill(fill: () => Promise<void>) {
  bambooAddressBusy += 1
  try {
    await fill()
  } finally {
    bambooAddressBusy = Math.max(0, bambooAddressBusy - 1)
    if (bambooAddressBusy === 0 && bambooRefillPending) queueBambooRefill()
  }
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
      bambooRefillPending = false
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
          const result = await handle(input, fieldText, personalInfo, '')
          // A react-select the rule owns but could not answer (nothing in the vault) stays
          // empty. Returning false let the generic matcher type a job title or the field id
          // into its search box.
          if (result === false && isReactSelectControl(input)) return 'skip'
          return result
        }
      }
      return false
    },
    // Job location preselects country (Norway on an Oslo posting). Visit that
    // select anyway so the profile country can replace it.
    includeFilled: (input) => isBambooCountryControl(input),
    formChanged: () => {
      if (bambooAddressBusy > 0) {
        bambooRefillPending = true
        return false
      }
      if (bambooRefillPending) {
        bambooRefillPending = false
        return true
      }
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
      if (sameBambooLabel(current, label)) return true

      await withBambooAddressFill(async () => {
        const regionBefore = bambooRegionSnapshot(input.ownerDocument)
        await fillBambooHRSelect(toggle, label, (optionTexts) =>
          pickBambooCountryOption(optionTexts, current, personalInfo.country),
        )
        // Selecting the country replaces the region widget and clears it.
        // Write the profile state into whatever control is on the form now.
        await fillBambooRegionAfterCountry(input.ownerDocument, personalInfo.state || '', regionBefore)
      })
      return true
    },
  },
  {
    match: (input, fieldText) => isBambooStateControl(input, fieldText),
    handle: async (input, _, personalInfo) => {
      const state = (personalInfo.state || '').trim()
      if (!state) return false
      // Never drive the country toggle from the state value.
      if (isBambooCountryControl(input)) return false

      // A Province box is a text input, even when a country toggle sits beside
      // it. Writing the state there must not open that menu.
      if (isBambooTextControl(input)) {
        return writeBambooProvinceText(input, state)
      }

      const toggle = bambooSelectToggle(input)
      if (!toggle) return false
      const current = bambooToggleLabel(toggle)
      if (sameBambooLabel(current, state)) return true
      await withBambooAddressFill(() =>
        fillBambooHRSelect(toggle, state, (optionTexts) => pickBambooStateOption(optionTexts, state)),
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
      fillNativeInput(input, requiresSponsorship ? 'Yes' : 'No')
      return true
    },
  },
  ...reactSelectEeoFieldHandlers,
]
