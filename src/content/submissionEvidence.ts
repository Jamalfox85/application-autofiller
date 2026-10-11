// application_submitted fires only when a submission actually succeeded.
// A submit click, a failed validation, or the same form still sitting there
// with invalid fields is not evidence. Success is a confirmation URL, a
// success message, or (after the page has settled) the application form
// leaving the document without an error.

import { FORM_MARKER_SELECTOR, MIN_APPLICATION_FIELDS } from './applicationDetect.ts'

export type SubmitMethod = 'clicked_submit' | 'confirmation_page'

export type SubmissionEvidenceKind =
  | 'confirmation_url'
  | 'confirmation_dom'
  | 'form_gone'
  | 'success_message'

export interface SubmissionSnapshot {
  href: string
  confirmationUrl: boolean
  applicationFormPresent: boolean
  validationFailed: boolean
  invalidFieldsPresent: boolean
  successMessageVisible: boolean
}

export interface SubmissionDecision {
  fire: boolean
  submissionSuccess: boolean
  submitMethod: SubmitMethod | null
  evidence: SubmissionEvidenceKind | null
}

const CONFIRMATION_URL =
  /thank[-_ ]?you|application[-_ ]?(submitted|received|complete)|\/confirmation|\/success/i

const SUCCESS_PHRASE =
  /thank(?:s| you) for applying|application (?:has been |was )?(?:successfully )?submitted|application (?:has been |was )?received|we(?:'ve| have) received your application|your application (?:is|was) (?:complete|received|submitted)|successfully submitted|submission (?:was )?successful/i

const ERROR_PHRASE =
  /this field is required|please (?:correct|fix|complete|enter)|errors? found|invalid (?:email|value|phone|entry)|field is required|correct the following|there was a problem|something went wrong|unable to submit|submission failed|please try again/i

const ERROR_SELECTOR = [
  '[aria-invalid="true"]',
  '.field-error',
  '.field_with_errors',
  '.error-message',
  '.validation-error',
  '#error_explanation',
  '[data-automation-id="errorHeading"]',
  '[data-automation-id="errorMessage"]',
  '[data-automation-id="errorBanner"]',
].join(', ')

const SUCCESS_SELECTOR = [
  'h1',
  'h2',
  'h3',
  '[role="status"]',
  '[role="alert"]',
  '[data-automation-id*="confirmation"]',
  '.confirmation',
  '.thank-you',
  '.thankyou',
].join(', ')

const FILLABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
].join(', ')

const EXTENSION_UI = '.gofillr-autofill-notification, .gofillr-autofill-prompt, .gofillr-paywall, #gofillr-toast-stack'

const FINAL_SUBMIT =
  /^(submit|submit application|submit my application|send application|send my application|finish and submit)$/i

const NONE: SubmissionDecision = {
  fire: false,
  submissionSuccess: false,
  submitMethod: null,
  evidence: null,
}

function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null
  const element = target as Element
  if (typeof element.tagName !== 'string' || typeof element.closest !== 'function') return null
  return element
}

function tag(el: Element): string {
  return el.tagName.toUpperCase()
}

function fieldType(el: Element): string {
  const typed = el as HTMLInputElement
  const value = typeof typed.type === 'string' ? typed.type : el.getAttribute('type') || ''
  return value.toLowerCase()
}

function controlLabel(el: Element): string {
  const typed = el as HTMLInputElement
  const value = typeof typed.value === 'string' ? typed.value : ''
  const aria = el.getAttribute('aria-label') || ''
  return (el.textContent || value || aria).replace(/\s+/g, ' ').trim()
}

function inExtensionUi(el: Element): boolean {
  return typeof el.closest === 'function' && !!el.closest(EXTENSION_UI)
}

function isShown(el: Element): boolean {
  let current: Element | null = el
  while (current) {
    if (current.getAttribute('aria-hidden') === 'true') return false
    if (current.hasAttribute('hidden')) return false
    const style = (current as HTMLElement).style
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
    current = current.parentElement
  }
  return true
}

function visibleText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

export function isConfirmationUrl(href: string): boolean {
  return CONFIRMATION_URL.test(href)
}

export function isFinalSubmitControl(el: Element): boolean {
  const label = controlLabel(el)
  if (FINAL_SUBMIT.test(label)) return true
  const type = fieldType(el)
  return type === 'submit' && label === ''
}

export function elementIsApplicationForm(form: Element): boolean {
  if (typeof form.matches === 'function' && form.matches(FORM_MARKER_SELECTOR)) return true
  if (typeof form.querySelector === 'function' && form.querySelector(FORM_MARKER_SELECTOR)) return true
  const fields = form.querySelectorAll(FILLABLE_SELECTOR)
  let visible = 0
  for (const field of fields) {
    if (!inExtensionUi(field) && isShown(field)) visible += 1
  }
  return visible >= MIN_APPLICATION_FIELDS
}

export function shouldArmOnSubmit(target: EventTarget | null): boolean {
  const element = asElement(target)
  if (!element) return false
  const form = tag(element) === 'FORM' ? element : element.closest('form')
  return !!form && elementIsApplicationForm(form)
}

export function shouldArmOnClick(target: EventTarget | null): boolean {
  const element = asElement(target)
  if (!element) return false
  const control = element.closest('button, input, a')
  if (!control || !isFinalSubmitControl(control)) return false
  const form = control.closest('form')
  if (form && elementIsApplicationForm(form)) return true
  return !!control.closest(FORM_MARKER_SELECTOR)
}

function visibleMarkers(doc: Document): Element[] {
  const found: Element[] = []
  for (const node of doc.querySelectorAll(FORM_MARKER_SELECTOR)) {
    if (!inExtensionUi(node) && isShown(node)) found.push(node)
  }
  return found
}

export function applicationFormPresent(doc: Document): boolean {
  if (visibleMarkers(doc).length > 0) return true
  for (const form of doc.querySelectorAll('form')) {
    if (isShown(form) && elementIsApplicationForm(form)) return true
  }
  return false
}

function applicationRoots(doc: Document): Element[] {
  const roots = visibleMarkers(doc)
  for (const form of doc.querySelectorAll('form')) {
    if (isShown(form) && elementIsApplicationForm(form)) roots.push(form)
  }
  return roots
}

function controlValue(el: Element): string {
  const typed = el as HTMLInputElement
  return typeof typed.value === 'string' ? typed.value.trim() : ''
}

function escapeName(name: string): string {
  const css = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS
  if (css && typeof css.escape === 'function') return css.escape(name)
  return name.replace(/["\\]/g, '\\$&')
}

// Chrome compiles pattern="" with the unicodeSets (`v`) flag. An unescaped `+`
// inside a class throws from checkValidity, and the console still reports that
// throw when the caller catches it. Skip the call when the pattern cannot compile.
function patternWouldThrowInChrome(node: Element): boolean {
  const pattern = node.getAttribute('pattern')
  if (!pattern) return false
  try {
    new RegExp(pattern, 'v')
    return false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/invalid flags|unknown flag/i.test(message) && !/character class/i.test(message)) return false
    return true
  }
}

function controlFailsConstraintValidation(node: HTMLInputElement): boolean {
  try {
    if (!node.willValidate || typeof node.checkValidity !== 'function') return false
    if (patternWouldThrowInChrome(node)) return false
    return node.checkValidity() === false
  } catch {
    // A stub control, or a pattern the pre-check did not recognize, is not a failed submit.
    return false
  }
}

function invalidFieldsIn(root: Element): boolean {
  for (const node of root.querySelectorAll('input, select, textarea')) {
    if (inExtensionUi(node) || !isShown(node)) continue
    const type = fieldType(node)
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue
    if ((node as HTMLInputElement).disabled) continue
    if (node.getAttribute('aria-invalid') === 'true') return true
    const required = (node as HTMLInputElement).required === true || node.hasAttribute('required')
    if (required && type !== 'checkbox' && type !== 'radio' && controlValue(node) === '') return true
    if (required && type === 'checkbox' && !(node as HTMLInputElement).checked) return true
    if (required && type === 'radio') {
      const name = (node as HTMLInputElement).name
      if (!name) {
        if (!(node as HTMLInputElement).checked) return true
      } else {
        const group = root.querySelectorAll(`input[type="radio"][name="${escapeName(name)}"]`)
        const picked = [...group].some((item) => (item as HTMLInputElement).checked)
        if (!picked) return true
      }
    }
    if (controlFailsConstraintValidation(node as HTMLInputElement)) return true
  }
  return false
}

function validationFailed(doc: Document): boolean {
  for (const node of doc.querySelectorAll(ERROR_SELECTOR)) {
    if (inExtensionUi(node) || !isShown(node)) continue
    if (node.getAttribute('aria-invalid') === 'true') return true
    const text = visibleText(node)
    if (!text) continue
    if (ERROR_PHRASE.test(text)) return true
    if (
      node.matches(
        '.field-error, .field_with_errors, .error-message, .validation-error, #error_explanation, [data-automation-id="errorHeading"], [data-automation-id="errorMessage"], [data-automation-id="errorBanner"]',
      )
    ) {
      return true
    }
  }
  for (const node of doc.querySelectorAll('[role="alert"]')) {
    if (inExtensionUi(node) || !isShown(node)) continue
    if (ERROR_PHRASE.test(visibleText(node))) return true
  }
  return false
}

function pageText(doc: Document): string {
  const body = doc.body
  if (!body) return ''
  const copy = body.cloneNode(true) as HTMLElement
  if (typeof copy.querySelectorAll === 'function') {
    for (const node of copy.querySelectorAll(EXTENSION_UI)) node.remove()
  }
  return visibleText(copy).slice(0, 8000)
}

function successMessageVisible(doc: Document, formPresent: boolean): boolean {
  for (const node of doc.querySelectorAll(SUCCESS_SELECTOR)) {
    if (inExtensionUi(node) || !isShown(node)) continue
    if (SUCCESS_PHRASE.test(visibleText(node))) return true
  }
  if (!formPresent && SUCCESS_PHRASE.test(pageText(doc))) return true
  return false
}

export function readSubmissionSnapshot(doc: Document, href: string): SubmissionSnapshot {
  const formPresent = applicationFormPresent(doc)
  return {
    href,
    confirmationUrl: isConfirmationUrl(href),
    applicationFormPresent: formPresent,
    validationFailed: validationFailed(doc),
    invalidFieldsPresent: applicationRoots(doc).some((root) => invalidFieldsIn(root)),
    successMessageVisible: successMessageVisible(doc, formPresent),
  }
}

function confirmed(submitMethod: SubmitMethod, evidence: SubmissionEvidenceKind): SubmissionDecision {
  return { fire: true, submissionSuccess: true, submitMethod, evidence }
}

export function decideSubmission(input: {
  submitAttempted: boolean
  hadApplicationForm: boolean
  beforeHref: string | null
  after: SubmissionSnapshot
  /** A form that disappears for a moment while the next step mounts is not success. */
  formGoneSettled: boolean
}): SubmissionDecision {
  const after = input.after
  if (after.validationFailed) return NONE
  if (after.applicationFormPresent && after.invalidFieldsPresent) return NONE

  if (after.confirmationUrl && !after.applicationFormPresent) {
    return confirmed('confirmation_page', 'confirmation_url')
  }

  if (after.successMessageVisible && !after.applicationFormPresent) {
    return confirmed(input.submitAttempted ? 'clicked_submit' : 'confirmation_page', 'success_message')
  }

  if (input.submitAttempted && after.successMessageVisible) {
    return confirmed('clicked_submit', 'success_message')
  }

  const urlChanged = !!input.beforeHref && input.beforeHref !== after.href
  const formGone =
    input.formGoneSettled &&
    input.submitAttempted &&
    input.hadApplicationForm &&
    !after.applicationFormPresent &&
    !urlChanged
  if (formGone) return confirmed('clicked_submit', 'form_gone')

  return NONE
}

export function submissionBelongsToAutofill(input: {
  href: string
  pageKey: string
  triggerKey: string
  triggerHost: string
}): boolean {
  if (input.triggerKey && input.pageKey && input.pageKey === input.triggerKey) return true
  let host = ''
  try {
    host = new URL(input.href).hostname
  } catch {
    return false
  }
  if (!input.triggerHost || host !== input.triggerHost) return false
  return isConfirmationUrl(input.href)
}
