import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { rememberSubmittedApplication } from '../services/billing/quotaPage.ts'
import {
  decideSubmission,
  isFinalSubmitControl,
  readSubmissionSnapshot,
  shouldArmOnClick,
  shouldArmOnSubmit,
  submissionBelongsToAutofill,
  type SubmissionSnapshot,
} from './submissionEvidence.ts'

const APPLY = 'https://boards.greenhouse.io/acme/jobs/123'
const THANKS = 'https://boards.greenhouse.io/acme/jobs/123/confirmation'

function snapshot(overrides: Partial<SubmissionSnapshot> = {}): SubmissionSnapshot {
  return {
    href: APPLY,
    confirmationUrl: false,
    applicationFormPresent: true,
    validationFailed: false,
    invalidFieldsPresent: false,
    successMessageVisible: false,
    ...overrides,
  }
}

function page(html: string, href = APPLY) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: href })
  return dom.window.document
}

test('a bare submit does not count, and clicked_submit is only a method after success', () => {
  const stillThere = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot(),
    formGoneSettled: true,
  })
  assert.equal(stillThere.fire, false)
  assert.equal(stillThere.submissionSuccess, false)
  assert.equal(stillThere.submitMethod, null)

  const confirmed = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({
      href: THANKS,
      confirmationUrl: true,
      applicationFormPresent: false,
    }),
    formGoneSettled: true,
  })
  assert.equal(confirmed.fire, true)
  assert.equal(confirmed.submissionSuccess, true)
  assert.equal(confirmed.submitMethod, 'confirmation_page')
  assert.equal(confirmed.evidence, 'confirmation_url')
})

test('validation errors and a form that still has invalid fields do not count', () => {
  const errors = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({
      href: THANKS,
      confirmationUrl: true,
      applicationFormPresent: false,
      validationFailed: true,
      successMessageVisible: true,
    }),
    formGoneSettled: true,
  })
  assert.equal(errors.fire, false)
  assert.equal(errors.submissionSuccess, false)

  const invalid = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({ invalidFieldsPresent: true, successMessageVisible: true }),
    formGoneSettled: true,
  })
  assert.equal(invalid.fire, false)
  assert.equal(invalid.submissionSuccess, false)
})

test('a success message or a settled form removal counts, and the next step does not', () => {
  const message = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({ successMessageVisible: true, applicationFormPresent: true }),
    formGoneSettled: false,
  })
  assert.equal(message.fire, true)
  assert.equal(message.submissionSuccess, true)
  assert.equal(message.submitMethod, 'clicked_submit')
  assert.equal(message.evidence, 'success_message')

  const tooSoon = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({ applicationFormPresent: false }),
    formGoneSettled: false,
  })
  assert.equal(tooSoon.fire, false)

  const gone = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({ applicationFormPresent: false }),
    formGoneSettled: true,
  })
  assert.equal(gone.fire, true)
  assert.equal(gone.submitMethod, 'clicked_submit')
  assert.equal(gone.evidence, 'form_gone')
  assert.equal(gone.submissionSuccess, true)

  const nextStep = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({ href: `${APPLY}?step=2`, applicationFormPresent: true }),
    formGoneSettled: true,
  })
  assert.equal(nextStep.fire, false)

  const leftThePage = decideSubmission({
    submitAttempted: true,
    hadApplicationForm: true,
    beforeHref: APPLY,
    after: snapshot({
      href: 'https://boards.greenhouse.io/acme',
      applicationFormPresent: false,
    }),
    formGoneSettled: true,
  })
  assert.equal(leftThePage.fire, false)
})

test('a confirmation page load counts once per application', () => {
  const loaded = decideSubmission({
    submitAttempted: false,
    hadApplicationForm: false,
    beforeHref: null,
    after: snapshot({
      href: THANKS,
      confirmationUrl: true,
      applicationFormPresent: false,
      successMessageVisible: true,
    }),
    formGoneSettled: true,
  })
  assert.equal(loaded.fire, true)
  assert.equal(loaded.submitMethod, 'confirmation_page')
  assert.equal(loaded.submissionSuccess, true)

  const jobKey = 'https://boards.greenhouse.io/acme/jobs/123'
  assert.equal(
    submissionBelongsToAutofill({
      href: THANKS,
      pageKey: jobKey,
      triggerKey: jobKey,
      triggerHost: 'boards.greenhouse.io',
    }),
    true,
  )
  assert.equal(
    submissionBelongsToAutofill({
      href: 'https://other.example/thank-you',
      pageKey: 'https://other.example/thank-you',
      triggerKey: jobKey,
      triggerHost: 'boards.greenhouse.io',
    }),
    false,
  )
  assert.equal(
    submissionBelongsToAutofill({
      href: 'https://boards.greenhouse.io/acme/thank-you',
      pageKey: 'https://boards.greenhouse.io/acme/thank-you',
      triggerKey: jobKey,
      triggerHost: 'boards.greenhouse.io',
    }),
    true,
  )

  const first = rememberSubmittedApplication([], [jobKey, THANKS])
  assert.equal(first.first, true)
  const again = rememberSubmittedApplication(first.keys, [jobKey])
  assert.equal(again.first, false)
  const otherJob = rememberSubmittedApplication(first.keys, ['https://boards.greenhouse.io/acme/jobs/456'])
  assert.equal(otherJob.first, true)
})

test('the DOM distinguishes a failed submit, a success, and an unrelated form', () => {
  const failed = page(`
    <form id="application-form">
      <input name="first_name" required value="" aria-invalid="true">
      <input name="last_name" required value="">
      <input name="email" required value="">
      <input name="phone" required value="">
      <p class="field-error">This field is required</p>
      <button type="submit">Submit</button>
    </form>
  `)
  const failedSnap = readSubmissionSnapshot(failed, APPLY)
  assert.equal(failedSnap.validationFailed, true)
  assert.equal(failedSnap.invalidFieldsPresent, true)
  assert.equal(failedSnap.successMessageVisible, false)
  assert.equal(shouldArmOnSubmit(failed.querySelector('form')), true)
  assert.equal(shouldArmOnClick(failed.querySelector('button')), true)

  const next = page(`
    <form id="application-form">
      <input name="school" required value="">
      <input name="degree" required value="">
      <input name="start" value="">
      <input name="end" value="">
      <button type="button">Next</button>
    </form>
  `)
  const nextButton = next.querySelector('button')
  assert.ok(nextButton)
  assert.equal(isFinalSubmitControl(nextButton), false)
  assert.equal(shouldArmOnClick(nextButton), false)
  const nextSnap = readSubmissionSnapshot(next, APPLY)
  assert.equal(nextSnap.applicationFormPresent, true)
  assert.equal(nextSnap.invalidFieldsPresent, true)
  assert.equal(
    decideSubmission({
      submitAttempted: true,
      hadApplicationForm: true,
      beforeHref: APPLY,
      after: nextSnap,
      formGoneSettled: true,
    }).fire,
    false,
  )

  const done = page(
    `<h1>Thank you for applying</h1><p>Your application has been submitted.</p>`,
    THANKS,
  )
  const doneSnap = readSubmissionSnapshot(done, THANKS)
  assert.equal(doneSnap.confirmationUrl, true)
  assert.equal(doneSnap.applicationFormPresent, false)
  assert.equal(doneSnap.successMessageVisible, true)
  assert.equal(doneSnap.validationFailed, false)
  const doneDecision = decideSubmission({
    submitAttempted: false,
    hadApplicationForm: false,
    beforeHref: null,
    after: doneSnap,
    formGoneSettled: true,
  })
  assert.equal(doneDecision.fire, true)
  assert.equal(doneDecision.submissionSuccess, true)
  assert.equal(doneDecision.submitMethod, 'confirmation_page')

  const search = page(`<form><input name="q" type="search"></form>`)
  assert.equal(shouldArmOnSubmit(search.querySelector('form')), false)

  const thanksWithChrome = page(
    `<h1>Thank you for applying</h1><form><input name="q" type="search"><input name="email" type="email"></form>`,
    THANKS,
  )
  const chromeSnap = readSubmissionSnapshot(thanksWithChrome, THANKS)
  assert.equal(chromeSnap.applicationFormPresent, false)
  assert.equal(chromeSnap.confirmationUrl, true)
  assert.equal(chromeSnap.successMessageVisible, true)
  assert.equal(
    decideSubmission({
      submitAttempted: false,
      hadApplicationForm: false,
      beforeHref: null,
      after: chromeSnap,
      formGoneSettled: true,
    }).fire,
    true,
  )

  const workday = page(`
    <div data-automation-id="applyFlowPage">
      <button type="button">Submit</button>
    </div>
  `)
  const submit = workday.querySelector('button')
  assert.ok(submit)
  assert.equal(shouldArmOnClick(submit), true)
})

test('an invalid pattern attribute cannot throw out of the submission snapshot', () => {
  const doc = page(
    '<form id="application-form"><input name="email" pattern="[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}" value="ada@example.com"></form>',
  )
  const input = doc.querySelector('input')
  assert.ok(input)
  let calls = 0
  input.checkValidity = () => {
    calls += 1
    throw new SyntaxError(
      "Failed to execute 'checkValidity' on 'HTMLInputElement': Invalid regular expression: /[A-Za-z0-9._%+-]/v: Invalid character in character class",
    )
  }
  let snapshot: SubmissionSnapshot | null = null
  assert.doesNotThrow(() => {
    snapshot = readSubmissionSnapshot(doc, APPLY)
  })
  assert.equal(snapshot?.invalidFieldsPresent, false)
  let patternIsInvalidUnderV = false
  try {
    new RegExp('[A-Za-z0-9._%+-]', 'v')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    patternIsInvalidUnderV = /character class|invalid regular expression/i.test(message)
  }
  if (patternIsInvalidUnderV) assert.equal(calls, 0)
})

test('a throwing willValidate or checkValidity does not escape, and a valid pattern is still checked', () => {
  const throwing = page('<form id="application-form"><input name="email" value="ada@example.com"></form>')
  const throwingInput = throwing.querySelector('input')
  assert.ok(throwingInput)
  Object.defineProperty(throwingInput, 'willValidate', {
    configurable: true,
    get() {
      throw new SyntaxError(
        "Failed to execute 'checkValidity' on 'HTMLInputElement': Invalid regular expression",
      )
    },
  })
  assert.doesNotThrow(() => readSubmissionSnapshot(throwing, APPLY))

  const checked = page('<form id="application-form"><input name="code" pattern="[A-Za-z]+" value="123"></form>')
  const checkedInput = checked.querySelector('input')
  assert.ok(checkedInput)
  let calls = 0
  checkedInput.checkValidity = () => {
    calls += 1
    throw new SyntaxError("Failed to execute 'checkValidity' on 'HTMLInputElement'")
  }
  let snapshot: SubmissionSnapshot | null = null
  assert.doesNotThrow(() => {
    snapshot = readSubmissionSnapshot(checked, APPLY)
  })
  assert.equal(calls > 0, true)
  assert.equal(snapshot?.invalidFieldsPresent, false)

  checkedInput.checkValidity = () => false
  assert.equal(readSubmissionSnapshot(checked, APPLY).invalidFieldsPresent, true)
})

test('the content script does not fire application_submitted from the submit event alone', () => {
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  assert.match(index, /trackEvent\('application_submitted'/)
  assert.match(index, /submission_success: submissionSuccess/)
  assert.match(index, /decideSubmission\(/)
  assert.doesNotMatch(index, /trackApplicationSubmitted\('clicked_submit'\)/)
  assert.doesNotMatch(index, /submission_success:\s*true/)
  assert.match(index, /shouldArmOnSubmit\(event\.target\)/)
})
