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
  assert.match(autofill, /recordFillHistory\(filledCount, attemptedCount\)/)
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
  assert.equal(app.includes("action: 'trackAutofill'"), false)
})
