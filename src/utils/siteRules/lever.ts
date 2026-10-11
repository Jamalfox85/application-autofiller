import type { SiteRule } from '../../types/index.ts'
import { detectAts, type AtsPageContext } from '../ats.ts'
import { dispatchFillEvent, fillNativeInput, setReactInputValue } from '../inputHandlers.ts'
import { ignorePagePatternError } from '../../lib/pagePatternError.ts'
import { assignLeverResumeFile } from './leverResumeFile.ts'
import {
  isLeverPlainResumeFile,
  isLeverResumeField,
  leverEeoKind,
  leverLocationQueries,
  leverPlan,
  leverRepeatKey,
  leverSelectedLocationValue,
  parseLeverLocationResults,
  pickLeverLocationHit,
  pickLeverLocationOption,
  summarizeLeverEeo,
  type LeverEeoKind,
  type LeverField,
  type LeverLocationHit,
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

let locationSearch: ((query: string) => Promise<unknown>) | null = null

export function setLeverLocationSearchForTests(
  search: ((query: string) => Promise<unknown>) | null,
) {
  locationSearch = search
}

function loadSavedResume(): Promise<SavedResume | null> {
  if (!resumeRequest) {
    resumeRequest = Promise.resolve()
      .then(() => resumeSource())
      .catch(() => null)
  }
  return resumeRequest
}

// Same loadSavedResume reply the service worker already returns. Messaging
// turns its Uint8Array into a plain object and keeps the file in bytesBase64.
async function accountResumePayload(): Promise<SavedResume | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message: unknown = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return leverResumeFromSavedMessage(message)
  } catch {
    return null
  }
}

function leverResumeFromSavedMessage(message: unknown): SavedResume | null {
  if (!message || typeof message !== 'object') return null
  const record = message as {
    ok?: unknown
    fileName?: unknown
    mimeType?: unknown
    bytes?: unknown
    bytesBase64?: unknown
  }
  if (record.ok !== true || typeof record.fileName !== 'string' || !record.fileName.trim()) return null
  const bytes = bytesFromSavedReply(record)
  if (!bytes) return null
  const mimeType =
    typeof record.mimeType === 'string' && record.mimeType.trim()
      ? record.mimeType.trim()
      : 'application/octet-stream'
  return { name: record.fileName.trim(), mimeType, bytes }
}

function bytesFromSavedReply(record: { bytes?: unknown; bytesBase64?: unknown }): Uint8Array | null {
  if (typeof record.bytesBase64 === 'string' && record.bytesBase64.trim()) {
    return bytesFromBase64(record.bytesBase64)
  }
  return liveResumeBytes(record.bytes)
}

function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.trim())
    if (!binary.length) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// A Uint8Array, ArrayBuffer, or number list still in this realm. A plain
// object left by messaging ({"0":37,"1":80}) is not a file.
function liveResumeBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value.byteLength > 0 ? new Uint8Array(value) : null
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value)
    return bytes.byteLength > 0 ? bytes : null
  }
  if (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === 'number')) {
    return Uint8Array.from(value)
  }
  return null
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
): Promise<boolean | 'skip'> {
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
  dispatchFillEvent(input, new Event('input', { bubbles: true }))
  dispatchFillEvent(input, new Event('change', { bubbles: true }))
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
  dispatchFillEvent(select, new Event('input', { bubbles: true }))
  dispatchFillEvent(select, new Event('change', { bubbles: true }))
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

// The location menu opens on `input` and searches on `keydown` (500ms debounce,
// GET /searchLocations). Choosing a row is a mousedown: that writes the visible
// name and JSON-encodes {name, id} into input[name=selectedLocation]. Blur while
// the menu is still shown (display not none) wipes both fields. Typing the city
// and leaving the menu open is why the field ends empty.
async function fillLeverLocation(
  input: HTMLInputElement,
  info: LeverProfile,
): Promise<boolean | 'skip'> {
  const queries = leverLocationQueries(info)
  if (queries.length === 0) return false
  const widget = locationWidgetRoot(input)
  if (!widget) return fillNativeInput(input, queries[0])

  for (const query of queries) {
    if (await commitLeverLocation(input, widget, query, info)) return true
  }
  closeLocationMenu(widget)
  setDomValue(input, '')
  const hidden = selectedLocationInput(widget)
  if (hidden) hidden.value = ''
  // The generic matcher would type the city and blur, which clears this menu.
  return 'skip'
}

async function commitLeverLocation(
  input: HTMLInputElement,
  widget: HTMLElement,
  query: string,
  info: LeverProfile,
): Promise<boolean> {
  const hitsPromise = searchLeverLocations(query, input.ownerDocument)
  const view = input.ownerDocument?.defaultView
  ignorePagePatternError(() => input.focus())
  setReactInputValue(input, query)
  const KeyboardEventCtor = view?.KeyboardEvent ?? KeyboardEvent
  dispatchFillEvent(
    input,
    new KeyboardEventCtor('keydown', { key: 'a', bubbles: true, cancelable: true }),
  )
  const hits = await hitsPromise
  // The page debounces the search by 500ms. Wait long enough to click a row
  // when that search paints, and no longer once our own results are in.
  const options = await waitForLocationOptions(widget, hits.length > 0 ? 700 : 3500)
  const hit =
    pickLeverLocationHit(hits, info) ||
    hitFromOptions(options, hits, info)
  if (!hit) return false

  const option = options.find((node) => cleanText(node.textContent) === hit.name)
  if (option) {
    const MouseEventCtor = view?.MouseEvent ?? MouseEvent
    dispatchFillEvent(
      option,
      new MouseEventCtor('mousedown', { bubbles: true, cancelable: true, button: 0 }),
    )
  }

  const hidden = selectedLocationInput(widget)
  // A mousedown the page handled already stored {name, id}. Don't replace that
  // JSON. If the page ignored the event, write the same payload ourselves.
  if (!locationCommitted(input, hidden, hit)) writeLocationValue(input, hidden, hit)
  closeLocationMenu(widget)
  dispatchChange(input)
  ignorePagePatternError(() => input.blur())
  // Blur wipes both fields while the menu is open. The menu is closed now; if a
  // handler still cleared them, write the payload again without an `input`
  // event (that event is what opens the menu).
  if (!locationCommitted(input, hidden, hit)) {
    writeLocationValue(input, hidden, hit)
    closeLocationMenu(widget)
  }
  return locationCommitted(input, hidden, hit)
}

function hitFromOptions(
  options: HTMLElement[],
  hits: LeverLocationHit[],
  info: LeverProfile,
): LeverLocationHit | null {
  const picked = pickLeverLocationOption(
    options.map((option) => option.textContent || ''),
    info,
  )
  if (!picked) return null
  return hits.find((hit) => hit.name === picked) ?? { name: picked }
}

function writeLocationValue(
  input: HTMLInputElement,
  hidden: HTMLInputElement | null,
  hit: LeverLocationHit,
) {
  setDomValue(input, hit.name)
  if (hidden) hidden.value = leverSelectedLocationValue(hit)
}

function locationCommitted(
  input: HTMLInputElement,
  hidden: HTMLInputElement | null,
  hit: LeverLocationHit,
): boolean {
  if (cleanText(input.value) !== hit.name) return false
  if (!hidden) return true
  try {
    const parsed = JSON.parse(hidden.value) as { name?: unknown; id?: unknown }
    if (cleanText(typeof parsed.name === 'string' ? parsed.name : '') !== hit.name) return false
    if (hit.id && parsed.id !== hit.id) return false
    return true
  } catch {
    return false
  }
}

function locationWidgetRoot(input: HTMLInputElement): HTMLElement | null {
  const root = (input.closest('.application-field') || input.parentElement) as HTMLElement | null
  if (!root) return null
  if (root.querySelector('.dropdown-container, input[name="selectedLocation"]')) return root
  return null
}

function selectedLocationInput(root: HTMLElement): HTMLInputElement | null {
  return (
    root.querySelector<HTMLInputElement>('input[name="selectedLocation"]') ||
    (root.ownerDocument.getElementById('selected-location') as HTMLInputElement | null)
  )
}

function closeLocationMenu(root: HTMLElement) {
  const menu = root.querySelector<HTMLElement>('.dropdown-container')
  if (menu) menu.style.display = 'none'
  const results = root.querySelector('.dropdown-results')
  if (results) results.replaceChildren()
  for (const name of ['.dropdown-no-results', '.dropdown-loading-results']) {
    const node = root.querySelector<HTMLElement>(name)
    if (node) node.style.display = 'none'
  }
}

function setDomValue(input: HTMLInputElement, value: string) {
  const view = input.ownerDocument?.defaultView
  const setter = view
    ? Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set
    : undefined
  if (setter) setter.call(input, value)
  else input.value = value
}

function dispatchChange(input: HTMLInputElement) {
  const EventCtor = input.ownerDocument?.defaultView?.Event ?? Event
  dispatchFillEvent(input, new EventCtor('change', { bubbles: true }))
}

function cleanText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

async function searchLeverLocations(
  query: string,
  doc: Document | null,
): Promise<LeverLocationHit[]> {
  try {
    const payload = locationSearch
      ? await locationSearch(query)
      : await fetchLocationResults(query, doc)
    return parseLeverLocationResults(payload)
  } catch {
    return []
  }
}

// /searchLocations rejects requests that do not come from the apply page. Run the
// request in the page so it carries that page's referrer, then fall back to a
// same-origin fetch when the page cannot run the script.
async function fetchLocationResults(query: string, doc: Document | null): Promise<unknown> {
  if (doc) {
    const fromPage = await fetchLocationsInPage(doc, query)
    if (fromPage != null) return fromPage
  }
  const response = await fetch(`/searchLocations?text=${encodeURIComponent(query)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return []
  return response.json()
}

const PAGE_LOCATION_SEARCH_MS = 4000

function fetchLocationsInPage(doc: Document, query: string): Promise<unknown | null> {
  const view = doc.defaultView
  const parent = doc.documentElement
  if (!view || !parent) return Promise.resolve(null)
  const token = `gofillr-location-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<Window['setTimeout']> | undefined
    const finish = (payload: unknown | null) => {
      if (settled) return
      settled = true
      if (timer !== undefined) view.clearTimeout(timer)
      view.removeEventListener('message', onMessage)
      resolve(payload)
    }
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; payload?: unknown } | null
      if (!data || data.type !== token) return
      finish('payload' in data ? (data.payload ?? null) : null)
    }
    view.addEventListener('message', onMessage)
    timer = view.setTimeout(() => finish(null), PAGE_LOCATION_SEARCH_MS)
    const script = doc.createElement('script')
    script.textContent = `(function () {
      var token = ${JSON.stringify(token)};
      var query = ${JSON.stringify(query)};
      function done(payload) {
        window.postMessage({ type: token, payload: payload }, '*');
      }
      try {
        Promise.resolve(
          fetch('/searchLocations?text=' + encodeURIComponent(query), {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
          })
        ).then(function (response) {
          return response && response.ok ? response.json() : [];
        }).then(done, function () { done([]); });
      } catch (e) {
        done([]);
      }
    })();`
    parent.appendChild(script)
    script.remove()
  })
}

async function waitForLocationOptions(root: HTMLElement, timeoutMs: number): Promise<HTMLElement[]> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const options = Array.from(root.querySelectorAll<HTMLElement>('.dropdown-location'))
    if (options.length > 0) return options
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  return []
}
