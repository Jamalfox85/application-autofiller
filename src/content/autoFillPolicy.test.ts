import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
const autofill = readFileSync(new URL('./autofill.ts', import.meta.url), 'utf8')

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
  assert.match(handler, /chrome\.storage\.local\.set\(patch, \(\) => sendResponse/)
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
