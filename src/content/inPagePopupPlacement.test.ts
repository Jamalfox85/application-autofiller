import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
const paywall = readFileSync(new URL('./fillPaywall.ts', import.meta.url), 'utf8')
const popup = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../assets/style.css', import.meta.url), 'utf8')

test('in-page toasts, confirmation, and prompt sit bottom-right', () => {
  assert.match(notifications, /right:\s*20px;\s*bottom:\s*20px;/)
  assert.match(notifications, /bottom:\s*24px;\s*right:\s*24px;/)
  assert.doesNotMatch(notifications, /top:\s*80px/)
  assert.doesNotMatch(notifications, /left:\s*\d+px/)
})

test('in-page fill paywall card sits bottom-right', () => {
  assert.match(paywall, /position:\s*fixed;\s*right:\s*20px;\s*bottom:\s*20px;/)
  assert.doesNotMatch(paywall, /align-items:\s*center/)
  assert.doesNotMatch(paywall, /justify-content:\s*center/)
})

test('browser-action popup stays 400 by 600', () => {
  assert.match(popup, /\.container\s*\{[^}]*width:\s*400px;/)
  assert.match(popup, /\.container\s*\{[^}]*height:\s*600px;/)
  assert.match(shell, /#app\s*\{[^}]*width:\s*400px;/)
})
