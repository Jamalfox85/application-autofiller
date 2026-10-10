import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

test('the popup shows a looking state while detection retries', () => {
  assert.match(app, /const detecting = ref\(true\)/)
  assert.match(app, /v-else-if="detecting"/)
  assert.match(app, /Looking for the form…/)
  // The error copy only renders after detecting is false.
  assert.ok(app.indexOf('Looking for the form…') < app.indexOf('No application form found</span>'))
  assert.match(app, /finally \{\s*detecting\.value = false/)
})

test('an empty profile gets a way back to Welcome from the dashboard', () => {
  assert.match(app, /v-if="!profileLooksFilled"/)
  assert.match(app, /@click="activeView = 'welcome'"/)
  assert.match(app, /Set up your profile/)
})
