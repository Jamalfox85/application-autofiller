import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
const autofill = readFileSync(new URL('./autofill.ts', import.meta.url), 'utf8')

test('a saved-password prompt is not reported as no matching fields', () => {
  assert.match(autofill, /isSavedPasswordPromptOpen\(\)/)
  assert.match(autofill, /awaiting_password/)
  assert.match(autofill, /awaitingPassword \? '' : 'No matching fields found'/)
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  assert.match(notifications, /code === 'awaiting_password'/)
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  assert.match(app, /response\?\.code === 'awaiting_password'/)
})

test('detection never calls autofillPage on its own', () => {
  assert.equal(/autofillPage\('auto_on_detect'\)/.test(index), false)
  assert.match(autofill, /triggerSource === 'auto_on_detect'/)
  assert.match(autofill, /code: 'needs_click'/)
})

test('detect OFF shows no prompt: the prompt sits behind autoDetectEnabled', () => {
  const block = index.slice(index.indexOf('if (autoDetectEnabled) {'))
  assert.match(block, /showAutofillPrompt\(\)/)
  assert.equal(/else\s*\{[^}]*showAutofillPrompt/.test(index), false)
})

test('history is recorded from the counted fill, not from the popup', () => {
  assert.match(autofill, /await recordFillHistory\(filledCount, attemptedCount\)/)
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  assert.equal(app.includes("action: 'trackAutofill'"), false)
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  const handler = background.slice(background.indexOf("request.action === 'trackAutofill'"))
  const setAt = handler.indexOf('chrome.storage.local.set(patch')
  const respondAt = handler.indexOf('sendResponse({ success: true })')
  assert.ok(setAt >= 0 && respondAt > setAt, 'history responds only after the row is stored')
})

test('signed-out fill asks the user to sign in, and the shortcut is not silent', () => {
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  assert.match(autofill, /refuseAutofill\(/)
  assert.match(autofill, /hasStoredSession\(/)
  assert.match(autofill, /refusal\.code === 'signed_out' \? 'signed_out' : 'empty_profile'/)
  assert.match(notifications, /export function presentFillFailure/)
  assert.match(notifications, /SIGN_IN_TO_FILL_MESSAGE/)
  assert.match(notifications, /EMPTY_PROFILE_FILL_MESSAGE/)
  assert.match(notifications, /label: 'Sign in'/)
  assert.match(notifications, /action: 'signInWithGoogle'/)
  const shortcut = index.slice(index.indexOf("if (request.action === 'autofill')"))
  assert.match(shortcut, /presentFillFailure\(result\)/)
  assert.match(notifications, /presentFillFailure\(result\)/)
  const popup = app.slice(app.indexOf('const autofillCurrentPage'), app.indexOf('const describeSyncError'))
  const signedOutAt = popup.indexOf("authStatus.value !== 'signed-in'")
  const emptyAt = popup.indexOf('refuseAutofill(')
  assert.ok(signedOutAt >= 0 && emptyAt > signedOutAt)
  assert.match(popup, /SIGN_IN_TO_FILL_MESSAGE/)
  assert.match(popup, /showNotification\(refusal\.message/)
  assert.match(app, /@signIn="signIn"/)
})

test('popup, toast, and shortcut still fill from a user click', () => {
  assert.match(index, /autofillPage\('user_clicked_button'\)/)
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  assert.match(notifications, /await autofillPage\(\)/)
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  assert.match(background, /command !== 'autofill-page'/)
  assert.match(background, /deliverAutofillCommand/)
  const connection = readFileSync(new URL('../utils/contentScriptConnection.ts', import.meta.url), 'utf8')
  assert.match(connection, /action: 'autofill'/)
})

test('a client-side navigation requires another click and can show the toast', () => {
  assert.match(index, /let lastUrl = window\.location\.href\n  setInterval/)
  assert.match(index, /pageNavigated\(\)/)
  const interval = index.slice(index.indexOf('setInterval(() => {'))
  assert.equal(interval.includes('let lastUrl'), false)
  assert.match(autofill, /export function pageNavigated/)
  assert.match(interval, /if \(autoDetectEnabled\)/)
})

test('a repeat fill on the same page says so instead of silently not counting', () => {
  assert.match(autofill, /repeatFill: filledCount > 0 && lastChargeWasRepeat/)
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  assert.match(notifications, /already counted this week/)
})

test('a later step does not emit another autofill_succeeded or history row', () => {
  const block = autofill.slice(autofill.indexOf('if (filledCount > 0)'))
  const chargedAt = block.indexOf('if (charged)')
  const successAt = block.indexOf("trackFillContract('autofill_succeeded'")
  const historyAt = block.indexOf('await recordFillHistory(filledCount, attemptedCount)')
  assert.ok(chargedAt >= 0 && successAt > chargedAt, 'autofill_succeeded follows a new claim')
  assert.ok(historyAt > chargedAt, 'history follows a new claim')
  assert.match(autofill, /quotaPageKey\(window\.location\.href\)/)
  const beforeCharge = block.slice(0, chargedAt)
  assert.equal(beforeCharge.includes("trackFillContract('autofill_succeeded'"), false)
})
