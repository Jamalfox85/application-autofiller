// Workday resume file attachment. The bytes come from requestSavedResume
// (the shared account download). A filename with no object is not a file.

import { assignResumeFile } from './bamboohrFields.ts'

const PLAIN_FILE_LABEL = /^(upload|choose file|choose a file|select file|select files)$/

function normalized(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

function withoutAutofillPhrases(value: string): string {
  return value
    .replace(/autofill with resume/gi, ' ')
    .replace(/autofill from resume/gi, ' ')
    .replace(/use my last application/gi, ' ')
    .replace(/use last application/gi, ' ')
}

function mentionsCoverLetter(value: string): boolean {
  return compact(value).includes('coverletter')
}

function mentionsResume(value: string): boolean {
  const stripped = withoutAutofillPhrases(value)
  const packed = compact(stripped)
  if (packed.includes('coverletter')) return false
  if (packed.includes('resume') || packed.includes('curriculumvitae')) return true
  return /(^|[^a-z])cv([^a-z]|$)/.test(stripped.toLowerCase())
}

function labelFor(input: HTMLInputElement): string {
  const doc = input.ownerDocument
  if (!input.id || !doc) return ''
  const safe = input.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return normalized(doc.querySelector(`label[for="${safe}"]`)?.textContent)
}

function accessibleName(input: HTMLInputElement): string {
  const aria = normalized(input.getAttribute('aria-label'))
  if (aria) return aria
  const labelledby = input.getAttribute('aria-labelledby')
  const doc = input.ownerDocument
  if (labelledby && doc) {
    const parts: string[] = []
    for (const id of labelledby.split(/\s+/)) {
      if (!id) continue
      const text = normalized(doc.getElementById(id)?.textContent)
      if (text) parts.push(text)
    }
    if (parts.length > 0) return parts.join(' ')
  }
  const title = normalized(input.getAttribute('title'))
  if (title) return title
  const explicit = labelFor(input)
  if (explicit) return explicit
  const wrapping = input.closest('label')
  if (wrapping) return normalized(wrapping.textContent)
  return ''
}

function nearbyCaption(input: HTMLInputElement): string {
  let node: Element | null = input.parentElement
  for (let depth = 0; depth < 5 && node; depth++) {
    const text = normalized(node.textContent)
    if (text && text.length <= 160) return text
    node = node.parentElement
  }
  return ''
}

export function isWorkdayResumeFileInput(input: HTMLInputElement): boolean {
  if (!input || input.tagName !== 'INPUT') return false
  if ((input.getAttribute('type') || '').toLowerCase() !== 'file') return false
  const name = accessibleName(input)
  const explicit = labelFor(input)
  const nearby = nearbyCaption(input)
  const own = `${name} ${explicit} ${input.id || ''} ${input.getAttribute('name') || ''} ${input.getAttribute('data-automation-id') || ''}`
  if (mentionsCoverLetter(own)) return false
  if (mentionsCoverLetter(nearby) && !mentionsResume(own)) return false
  if (mentionsResume(own) || mentionsResume(nearby)) return true
  if (PLAIN_FILE_LABEL.test(name) || PLAIN_FILE_LABEL.test(explicit)) {
    return !mentionsCoverLetter(nearby)
  }
  return false
}

export function workdayResumeFileInput(root: ParentNode): HTMLInputElement | null {
  for (const input of Array.from(root.querySelectorAll('input'))) {
    if (isWorkdayResumeFileInput(input)) return input
  }
  return null
}

export function isWorkdayCoverLetterFileInput(input: HTMLInputElement): boolean {
  if (!input || input.tagName !== 'INPUT') return false
  if ((input.getAttribute('type') || '').toLowerCase() !== 'file') return false
  if (isWorkdayResumeFileInput(input)) return false
  const name = accessibleName(input)
  const explicit = labelFor(input)
  const nearby = nearbyCaption(input)
  const own = `${name} ${explicit} ${input.id || ''} ${input.getAttribute('name') || ''}`
  return mentionsCoverLetter(own) || mentionsCoverLetter(nearby)
}

// Puts the saved file on a plain Workday resume input. Does not click the
// control, Autofill with Resume, or Submit. No file, or an empty file, leaves
// the input empty.
export async function attachWorkdaySavedResume(
  input: HTMLInputElement,
  file: File | null,
): Promise<boolean> {
  if (!isWorkdayResumeFileInput(input)) return false
  if ((input.files?.length ?? 0) > 0) return false
  return assignResumeFile(input, file)
}
