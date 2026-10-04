// BambooHR address country is a Fabric select. The posting default (Norway on an
// Oslo job, value 161) is already selected, and the real choices live in the
// menu, not in the hidden <select>. Profile countries are snake_case keys.

export function bambooCountryLabel(country?: string | null): string | null {
  const raw = (country ?? '').trim()
  if (!raw) return null
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (key === 'united_states' || key === 'unitedstates' || key === 'us' || key === 'usa') {
    return 'United States'
  }
  return null
}

// Picks the profile country from the open menu. A different current value
// (Norway, or the id "161") does not win when United States is also listed.
export function pickBambooCountryOption(
  optionTexts: string[],
  currentValue: string,
  profileCountry?: string | null,
): string | null {
  const label = bambooCountryLabel(profileCountry)
  if (!label) return null
  const wanted = label.toLowerCase()
  const exact = optionTexts.map((text) => text.trim()).find((text) => text.toLowerCase() === wanted)
  if (!exact) return null
  // The posting default (Norway, or id 161) is currentValue. The profile option replaces it.
  const current = currentValue.trim().toLowerCase()
  if (current === exact.toLowerCase()) return exact
  return exact
}

type CountryControl = {
  name?: string
  id?: string
  type?: string
}

// The address country widget is <select name="countryId.value">. State, college,
// and yes/no questions are not this control.
export function isBambooCountryControl(input: CountryControl): boolean {
  const type = (input.type || '').toLowerCase()
  if (type === 'hidden' || type === 'file' || type === 'radio' || type === 'checkbox') return false
  const name = (input.name || '').toLowerCase()
  const id = (input.id || '').toLowerCase()
  return name.includes('countryid') || id.includes('countryid')
}

// The visible Fabric toggle, not the clear button that sits beside it.
export function bambooSelectToggle(input: Element): HTMLButtonElement | null {
  const root = input.closest('.fab-Select')
  const toggle = root?.querySelector('button.fab-SelectToggle')
  if (toggle && toggle.tagName === 'BUTTON') return toggle as HTMLButtonElement
  return null
}

export function bambooToggleLabel(toggle: Element): string {
  const content = toggle.querySelector('.fab-SelectToggle__content')?.textContent?.trim()
  if (content) return content
  const aria = toggle.getAttribute('aria-label')?.trim() || ''
  return aria.replace(/^country\s+/i, '').trim()
}

// A plain choose-file control on the apply form. "autofill" is the separate
// control that parses a resume into the application; GoFillr already fills
// those text fields, so that control is never clicked.
export type BambooUploadRole = 'resume' | 'cover' | 'autofill' | 'other'

export type BambooUploadControl = {
  tagName?: string
  type?: string
  name?: string
  id?: string
  label?: string
  ariaLabel?: string
  text?: string
}

const GENERIC_RESUME_LABELS = new Set([
  'upload',
  'uploadfile',
  'uploadresume',
  'uploaderesume',
  'choosefile',
  'chooseafile',
  'selectfile',
  'selectafile',
  'addfile',
  'addresume',
  'browse',
  'browsefile',
  'browsefiles',
])

function compactUploadText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function uploadKey(control: BambooUploadControl): string {
  return compactUploadText(
    [control.name, control.id, control.label, control.ariaLabel, control.text].filter(Boolean).join(' '),
  )
}

function mentionsResume(key: string): boolean {
  if (key.includes('coverletter')) return false
  if (key.includes('curriculumvitae') || key.includes('resume')) return true
  return key === 'cv' || key.startsWith('cv') || key.endsWith('cv')
}

function mentionsOtherDocument(key: string): boolean {
  return [
    'transcript',
    'portfolio',
    'writingsample',
    'writing',
    'eeo',
    'veteran',
    'disability',
    'gender',
    'diversity',
    'additional',
  ].some((part) => key.includes(part))
}

// "Autofill with resume", "auto-fill from resume", "parse resume", and the same
// idea under another verb. A resume choose-file control does not use these words.
function isAutofillFromResume(key: string): boolean {
  if (!mentionsResume(key) && !key.includes('resume')) return false
  return (
    key.includes('autofill') ||
    key.includes('fillwith') ||
    key.includes('fillfrom') ||
    key.includes('parse') ||
    key.includes('importfrom') ||
    key.includes('applywithresume')
  )
}

export function bambooUploadRole(control: BambooUploadControl): BambooUploadRole {
  const key = uploadKey(control)
  const type = (control.type || '').toLowerCase()
  const tag = (control.tagName || '').toLowerCase()
  const isFile = type === 'file'

  if (isAutofillFromResume(key)) return 'autofill'

  if (key.includes('coverletter') && (isFile || tag === 'textarea' || type === 'textarea')) {
    return 'cover'
  }

  if (!isFile) return 'other'
  if (mentionsOtherDocument(key) && !key.includes('resume') && !key.includes('curriculumvitae')) {
    return 'other'
  }
  if (mentionsResume(key)) return 'resume'

  const labelKey = compactUploadText(control.label || control.ariaLabel || '')
  const nameKey = compactUploadText(`${control.name || ''} ${control.id || ''}`)
  if (
    (GENERIC_RESUME_LABELS.has(labelKey) ||
      GENERIC_RESUME_LABELS.has(nameKey) ||
      GENERIC_RESUME_LABELS.has(key)) &&
    !mentionsOtherDocument(key)
  ) {
    return 'resume'
  }
  return 'other'
}

function cssEscape(value: string, view: { CSS?: { escape?: (text: string) => string } } | null): string {
  if (view?.CSS?.escape) return view.CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

function labelFor(input: HTMLElement, token: string): string {
  const doc = input.ownerDocument
  if (!doc || !token) return ''
  const view = doc.defaultView
  const match = doc.querySelector(`label[for="${cssEscape(token, view)}"]`)
  return match?.textContent || ''
}

// The careers form's choose-file control is a file input with no name or id.
// Its aria-label is "file-input". "Resume*" / "Cover Letter" is a caption on an
// ancestor, next to a hidden resumeFileId or coverLetterFileId. The immediate
// parent also holds the Choose File button, so it is not a single-control label.
// Stop at the first ancestor that contains another file input, or the cover
// letter caption would be read onto the resume input.
function singleFileCaption(input: HTMLElement): { name: string; label: string } {
  const type = (input.getAttribute('type') || (input as HTMLInputElement).type || '').toLowerCase()
  if (type !== 'file') return { name: '', label: '' }
  let node = input.parentElement
  let matched: HTMLElement | null = null
  while (node && node.tagName !== 'BODY' && node.tagName !== 'HTML' && node.tagName !== 'FORM') {
    const files = node.querySelectorAll('input[type="file"]')
    if (files.length !== 1 || files[0] !== input) break
    const hiddenName = node.querySelector('input[type="hidden"][name]')?.getAttribute('name') || ''
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
    const named = /resume|cover/i.test(hiddenName)
    const captioned = text.length > 0 && text.length <= 160 && /resume|cover\s*letter|curriculum\s*vitae/i.test(text)
    if (named || captioned) matched = node
    node = node.parentElement
  }
  if (!matched) return { name: '', label: '' }
  const hiddenName = matched.querySelector('input[type="hidden"][name]')?.getAttribute('name') || ''
  const label = (matched.textContent || '').replace(/\s+/g, ' ').trim()
  return { name: hiddenName, label: label.length <= 160 ? label : '' }
}

// Labels on this control only. A fieldset that also wraps the cover letter
// would make the resume input look like a cover letter.
export function describeBambooUpload(input: HTMLElement, fieldText = ''): BambooUploadControl {
  const tagName = input.tagName
  const typeAttr = (input.getAttribute('type') || '').toLowerCase()
  const type = tagName === 'BUTTON' ? 'button' : typeAttr || (input as HTMLInputElement).type || ''
  const caption = singleFileCaption(input)
  const name = input.getAttribute('name') || caption.name
  const id = input.getAttribute('id') || ''
  const chunks = [labelFor(input, id)]
  if (name && name !== id) chunks.push(labelFor(input, name))
  if (caption.label) chunks.push(caption.label)
  const wrapping = input.closest('label')
  if (wrapping) chunks.push(wrapping.textContent || '')

  const parent = input.parentElement
  const parentTag = parent?.tagName
  if (
    parent &&
    parentTag !== 'FORM' &&
    parentTag !== 'BODY' &&
    parentTag !== 'HTML' &&
    parent.querySelectorAll('input, textarea, select, button').length === 1
  ) {
    for (const child of Array.from(parent.children)) {
      if (child === input || child.contains(input)) continue
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim()
      if (text && text.length <= 80) chunks.push(text)
    }
  }

  const ownValue =
    type === 'button' || type === 'submit' || tagName === 'BUTTON'
      ? input.getAttribute('value') || input.textContent || ''
      : ''

  return {
    tagName,
    type,
    name,
    id,
    label: chunks.filter(Boolean).join(' '),
    ariaLabel: input.getAttribute('aria-label') || '',
    text: [ownValue, fieldText].filter(Boolean).join(' '),
  }
}

// Copies the saved file onto the input in the document's own realm. Returns
// false when there is no file to assign, leaving the control empty.
export async function assignResumeFile(input: HTMLInputElement, file: File | null): Promise<boolean> {
  try {
    if (!file || !file.name || file.size <= 0) return false
    const type = (input.getAttribute('type') || input.type || '').toLowerCase()
    if (input.tagName !== 'INPUT' || type !== 'file' || input.disabled) return false

    const view = input.ownerDocument?.defaultView as
      | (Window & { File?: typeof File; DataTransfer?: typeof DataTransfer })
      | null
    const FileCtor = view?.File
    const DataTransferCtor = view?.DataTransfer
    if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return false

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) return false
    const localFile = new FileCtor([bytes], file.name, {
      type: file.type || 'application/octet-stream',
    })
    const transfer = new DataTransferCtor()
    transfer.items.add(localFile)
    input.files = transfer.files

    const assigned = input.files?.[0]
    if (!assigned || assigned.name !== file.name || assigned.size !== file.size) return false

    const EventCtor = view?.Event ?? Event
    input.dispatchEvent(new EventCtor('input', { bubbles: true }))
    input.dispatchEvent(new EventCtor('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}
