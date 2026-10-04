import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
const paywall = readFileSync(new URL('./fillPaywall.ts', import.meta.url), 'utf8')
const stack = readFileSync(new URL('./toastStack.ts', import.meta.url), 'utf8')
const popup = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../assets/style.css', import.meta.url), 'utf8')

test('in-page toasts, confirmation, and prompt sit in the bottom-right stack', () => {
  assert.match(stack, /right:\s*20px/)
  assert.match(stack, /bottom:\s*20px/)
  assert.match(stack, /flex-direction:\s*column/)
  assert.match(stack, /gap:\s*8px/)
  assert.match(notifications, /mountInToastStack/)
  assert.match(notifications, /node\.id === 'match-score'/)
  assert.doesNotMatch(notifications, /top:\s*80px/)
  assert.doesNotMatch(notifications, /left:\s*\d+px/)
  assert.doesNotMatch(notifications, /bottom:\s*24px/)
})

test('in-page fill paywall card joins the bottom-right stack', () => {
  assert.match(paywall, /mountInToastStack\(card\)/)
  assert.doesNotMatch(paywall, /align-items:\s*center/)
  assert.doesNotMatch(paywall, /justify-content:\s*center/)
  assert.doesNotMatch(paywall, /position:\s*fixed;\s*right:\s*20px;\s*bottom:\s*20px;/)
})

test('browser-action popup stays 400 by 600', () => {
  assert.match(popup, /\.container\s*\{[^}]*width:\s*400px;/)
  assert.match(popup, /\.container\s*\{[^}]*height:\s*600px;/)
  assert.match(shell, /#app\s*\{[^}]*width:\s*400px;/)
})
