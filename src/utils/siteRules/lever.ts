import type { SiteRule } from '../../types/index.ts'
import { detectAts, type AtsPageContext } from '../ats.ts'
import { fillNativeInput, setReactInputValue } from '../inputHandlers.ts'
import { assignLeverResumeFile } from './leverResumeFile.ts'
import { requestSavedResume as requestAccountResume } from './bamboohrResume.ts'
import {
  isLeverPlainResumeFile,
  isLeverResumeField,
  leverEeoKind,
  leverLocationQueries,
  leverPlan,
  leverRepeatKey,
  pickLeverLocationOption,
  summarizeLeverEeo,
  type LeverEeoKind,
  type LeverField,
  type LeverProfile,
} from './leverFields.ts'

// Hosted Lever apply pages (jobs.lever.co and other *.lever.co hosts). Custom-domain
// embeds are out of scope: the content script fills the frame whose hostname is lever.co.

export function isHostedLeverPage(input: AtsPageContext): boolean {
  return detectAts(input) === 'lever'
}

type EeoNote = { enabled: boolean; filled: boolean }

const eeoNotes = new Map<string, EeoNote>()

type SavedResume = { name: string; mimeType: string; bytes: Uint8Array }

let resumeSource: () => Promise<SavedResume | null> = accountResumePayload
let resumeRequest: Promise<SavedResume | null> | null = null

export function setLeverResumeSourceForTests(source: (() => Promise<SavedResume | null>) | null) {
  resumeSource = source ?? accountResumePayload
  resumeRequest = null
}

export function beginLeverFill() {
  eeoNotes.clear()
  resumeRequest = null
}

function loadSavedResume(): Promise<SavedResume | null> {
  if (!resumeRequest) {
    resumeRequest = Promise.resolve()
      .then(() => resumeSource())
      .catch(() => null)
  }
  return resumeRequest
}

// Same account download BambooHR already uses. Lever only assigns the file.
async function accountResumePayload(): Promise<SavedResume | null> {
  const file = await requestAccountResume()
  if (!file || file.size <= 0 || !file.name.trim()) return null
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    bytes: new Uint8Array(await file.arrayBuffer()),
  }
}

export function readLeverEeoTelemetry() {
  return summarizeLeverEeo([...eeoNotes.values()])
}

export default function leverConfig(): SiteRule {
  return {
    detect: () =>
      isHostedLeverPage({
        hostname: window.location.hostname,
        href: window.location.href,
        document,
      }),
    apply: async (input, _fieldText, personalInfo) => {
      if (!input.closest('#application-form, form.application-form, .application-form'))
        return false
      const field = describeLeverField(input)
      if (isLeverResumeField(field)) {
        // tagName, not instanceof: the content script and the test realm do not
        // share one HTMLInputElement constructor.
        if (input.tagName !== 'INPUT' || (input as HTMLInputElement).type !== 'file' || !isLeverPlainResumeFile(field)) {
          return false
        }
        try {
          const resume = await loadSavedResume()
          if (!resume) return false
          return assignLeverResumeFile(input as HTMLInputElement, resume)
        } catch (error) {
          console.error('[lever] could not attach the saved resume', error)
          return false
        }
      }

      const repeatKey = leverRepeatKey(field)
      const index = repeatKey ? repeatIndex(input, repeatKey) : 0
      const optionTexts =
        input instanceof HTMLSelectElement
          ? Array.from(input.options).map((option) => option.textContent || option.label || '')
          : []
      const profile = personalInfo as LeverProfile
      const plan = leverPlan(field, profile, index, {
        optionTexts,
        now: new Date(),
        disabilityAnswered: disabilitySelectAnswered(),
      })

      // EEO misses are recorded and then ignored. A missing or unmapped diversity
      // question must not turn a contact fill into autofill_failed.
      if (leverEeoKind(field)) {
        if (!plan) {
          noteEeo(field, profile, false)
          return false
        }
        const wrote = await writePlan(input, plan, profile)
        noteEeo(field, profile, wrote)
        return wrote
      }

      if (!plan) return false
      return writePlan(input, plan, profile)
    },
    // Questions, including the hidden disability signature, are in the initial HTML.
    formChanged: () => false,
  }
}

async function writePlan(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  plan: NonNullable<ReturnType<typeof leverPlan>>,
  profile: LeverProfile,
): Promise<boolean> {
  if (plan.action === 'claim') return true
  if (plan.action === 'click') {
    if (!(input instanceof HTMLInputElement)) return false
    clickChoice(input)
    return true
  }
  if (plan.action === 'select') {
    if (!(input instanceof HTMLSelectElement)) return false
    return commitSelect(input, plan.optionText)
  }
  if (plan.action === 'location') {
    if (!(input instanceof HTMLInputElement)) return false
    return fillLeverLocation(input, profile)
  }
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false
  return fillNativeInput(input, plan.value)
}

function noteEeo(field: LeverField, info: LeverProfile, filled: boolean) {
  const kind: LeverEeoKind | null = leverEeoKind(field)
  if (!kind) return
  const enabled = info.eeoAnswersEnabled !== false
  const key = (field.name || '').trim() || `${kind}:${field.label || ''}`
  const prev = eeoNotes.get(key)
  if (!prev) {
    eeoNotes.set(key, { enabled, filled: enabled && filled })
    return
  }
  eeoNotes.set(key, {
    enabled: prev.enabled || enabled,
    filled: prev.filled || (enabled && filled),
  })
}

function disabilitySelectAnswered(): boolean {
  if (typeof document === 'undefined') return false
  const select = document.querySelector<HTMLSelectElement>('select[name="eeo[disability]"]')
  return !!select?.value
}

function describeLeverField(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): LeverField {
  const question = input.closest('.application-question')
  const labelEl = question?.querySelector('.application-label')
  const rawLabel = labelEl?.querySelector('.text')?.textContent || labelEl?.textContent || ''
  const controlType = input.tagName === 'SELECT' ? 'select-one' : (input as HTMLInputElement).type || ''
  const optionLabel =
    controlType === 'radio' || controlType === 'checkbox'
      ? input.closest('label')?.querySelector('.application-answer-alternative')?.textContent ||
        input.value
      : controlType === 'file'
        ? fileChooserLabel(input as HTMLInputElement)
        : ''
  return {
    name: input.name || '',
    id: input.id || '',
    type: controlType,
    label: cleanLabel(rawLabel),
    optionLabel: cleanLabel(optionLabel),
    dataQa: input.getAttribute('data-qa'),
    className: input.className || '',
  }
}

function cleanLabel(value: string): string {
  return value.replace(/✱/g, '').replace(/\s+/g, ' ').trim()
}

// The visible choose-file caption ("ATTACH RESUME/CV", "Choose file"), not the
// "Analyzing resume..." status Lever shows after its own parser runs.
function fileChooserLabel(input: HTMLInputElement): string {
  const control = input.closest('a, button')
  const scoped = control ?? input.closest('.application-field')
  const explicit = scoped?.querySelector('.default-label')?.textContent
  if (explicit?.trim()) return explicit
  if (!control) return ''
  const clone = control.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'input, svg, script, style, .resume-upload-failure, .resume-upload-working, .resume-upload-success, .resume-upload-oversize',
    )
    .forEach((node) => node.remove())
  return clone.textContent || ''
}

function repeatIndex(input: HTMLElement, key: string): number {
  const form = input.closest('form')
  if (!form) return 0
  const seen = new Set<string>()
  let count = 0
  for (const node of form.querySelectorAll('input, textarea, select')) {
    if (node === input) break
    const field = describeLeverField(node as HTMLInputElement)
    if (leverRepeatKey(field) !== key) continue
    const group = (node as HTMLInputElement).name || (node as HTMLElement).id
    if (group) {
      if (seen.has(group)) continue
      seen.add(group)
    }
    count++
  }
  return count
}

function clickChoice(input: HTMLInputElement) {
  if (input.checked) return
  input.click()
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function commitSelect(select: HTMLSelectElement, optionText: string): boolean {
  const wanted = optionText.replace(/\s+/g, ' ').trim().toLowerCase()
  const match = Array.from(select.options).find((option) => {
    const text = (option.textContent || option.label || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return text === wanted
  })
  if (!match) return false
  select.value = match.value
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
  const jq = (
    globalThis as {
      jQuery?: (el: Element) => { val: (v: string) => { trigger: (e: string) => void } }
    }
  ).jQuery
  if (typeof jq === 'function') {
    try {
      jq(select).val(match.value).trigger('change')
    } catch {
      // Select2 is optional. The native value is what the form submits.
    }
  }
  return true
}

// Lever's location widget searches on keydown (500ms debounce) and clears the
// input on blur unless a .dropdown-location row was chosen with mousedown.
async function fillLeverLocation(input: HTMLInputElement, info: LeverProfile): Promise<boolean> {
  const queries = leverLocationQueries(info)
  const root = input.closest('.application-field') || input.parentElement || document.body
  for (const query of queries) {
    input.focus()
    setReactInputValue(input, query)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    const options = await waitForLocationOptions(root)
    if (options.length === 0) continue
    const picked = pickLeverLocationOption(
      options.map((option) => option.textContent || ''),
      info,
    )
    const target = picked
      ? options.find((option) => (option.textContent || '').replace(/\s+/g, ' ').trim() === picked)
      : undefined
    if (!target) continue
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const hidden = root.querySelector<HTMLInputElement>('input[name="selectedLocation"]')
    if (hidden?.value || input.value.trim() === picked) {
      input.blur()
      return true
    }
  }
  return false
}

async function waitForLocationOptions(root: ParentNode): Promise<HTMLElement[]> {
  const started = Date.now()
  while (Date.now() - started < 3500) {
    const options = Array.from(root.querySelectorAll<HTMLElement>('.dropdown-location'))
    if (options.length > 0) return options
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return []
}
