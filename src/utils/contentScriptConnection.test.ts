import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  deliverAutofillCommand,
  isMissingContentScriptError,
  type AutofillTabMessenger,
} from './contentScriptConnection.ts'

test('missing content-script errors are the reinject signal', () => {
  assert.equal(
    isMissingContentScriptError(new Error('Could not establish connection. Receiving end does not exist.')),
    true,
  )
  assert.equal(isMissingContentScriptError(new Error('The message port closed before a response was received.')), false)
  assert.equal(isMissingContentScriptError(new Error('Cannot access page')), false)
})

test('keyboard autofill sends action autofill with no sign-in step', async () => {
  const messages: unknown[] = []
  const messenger: AutofillTabMessenger = {
    async sendMessage(_tabId, message) {
      messages.push(message)
      return { success: true }
    },
    async executeScript() {
      throw new Error('content script was already listening')
    },
  }

  const result = await deliverAutofillCommand(7, messenger)
  assert.equal(result, 'sent')
  assert.deepEqual(messages, [{ action: 'autofill' }])
})

test('a missing receiver injects content.js and retries the autofill message', async () => {
  const events: string[] = []
  let sends = 0
  const messenger: AutofillTabMessenger = {
    async sendMessage() {
      sends += 1
      events.push(`send:${sends}`)
      if (sends === 1) {
        throw new Error('Could not establish connection. Receiving end does not exist.')
      }
      return { success: true }
    },
    async insertCSS() {
      events.push('css')
    },
    async executeScript() {
      events.push('js')
    },
  }

  const result = await deliverAutofillCommand(4, messenger)
  assert.equal(result, 'reinjected')
  assert.deepEqual(events, ['send:1', 'css', 'js', 'send:2'])
})

test('other send failures are not treated as a missing content script', async () => {
  let injected = false
  const messenger: AutofillTabMessenger = {
    async sendMessage() {
      throw new Error('The tab was closed.')
    },
    async executeScript() {
      injected = true
    },
  }

  await assert.rejects(() => deliverAutofillCommand(1, messenger), /tab was closed/)
  assert.equal(injected, false)
})

const CONTENT_SCRIPT_MATCHES = [
  'https://*.greenhouse.io/*',
  'https://*.lever.co/*',
  'https://*.eu.lever.co/*',
  'https://*.myworkdayjobs.com/*',
  'https://*.myworkday.com/*',
  'https://*.myworkdaysite.com/*',
  'https://*.workday.com/*',
  'https://*.ashbyhq.com/*',
  'https://*.bamboohr.com/*',
  'https://*.icims.com/*',
  'https://*.jobvite.com/*',
  'https://*.apply.workable.com/*',
  'https://gofillr.com/*',
  'https://www.gofillr.com/*',
]

const ALL_SITES = /^(?:<all_urls>|(?:\*|https?|file|ftp):\/\/\*\/\*)$/

function assertNoAllSites(value: unknown, path: string) {
  if (typeof value === 'string') {
    assert.equal(ALL_SITES.test(value), false, `${path} is an all-sites pattern: ${value}`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAllSites(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertNoAllSites(child, `${path}.${key}`)
    }
  }
}

test('manifest content script and the command fallback target content.js', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'))
  assert.ok(manifest.permissions.includes('scripting'))
  assert.ok(manifest.permissions.includes('storage'))
  assert.deepEqual(manifest.host_permissions, [
    ...CONTENT_SCRIPT_MATCHES,
    'https://chromewebstore.google.com/*',
    'https://chrome.google.com/*',
    'https://extensionpay.com/*',
    'https://app.posthog.com/*',
    'https://api.mixpanel.com/*',
    'https://api-js.mixpanel.com/*',
    'https://*.supabase.co/*',
    'https://api-production-5aca1.up.railway.app/*',
    'https://api.eu.lever.co/*',
    'https://www.workable.com/*',
  ])
  assertNoAllSites(manifest, 'manifest')
  assert.equal(manifest.commands['autofill-page'].suggested_key.default, 'Ctrl+Shift+F')
  const contentScript = manifest.content_scripts.find((entry) => entry.js?.includes('content.js'))
  assert.ok(contentScript)
  assert.deepEqual(contentScript.matches, CONTENT_SCRIPT_MATCHES)
  assert.deepEqual(contentScript.js, ['content.js'])
  assert.equal(contentScript.all_frames, true)
  const extensionPay = manifest.content_scripts.find((entry) =>
    entry.js?.includes('extensionPayContent.js'),
  )
  assert.ok(extensionPay)
  assert.deepEqual(extensionPay.matches, ['https://extensionpay.com/*'])
  assert.deepEqual(manifest.web_accessible_resources[0].matches, [
    ...CONTENT_SCRIPT_MATCHES,
    'https://extensionpay.com/*',
  ])

  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  assert.match(background, /command !== 'autofill-page'/)
  assert.match(background, /deliverAutofillCommand/)
  assert.match(background, /files:\s*\['content\.js'\]/)
  assert.match(background, /files:\s*\['content\.css'\]/)
})
