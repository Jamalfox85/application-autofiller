import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The content script imports Ashby site rules at load. Counting fillable fields
// before FORM_ROOTS was initialized threw in every frame, so chrome.runtime.onMessage
// never ran and Ctrl+Shift+F reported "Receiving end does not exist".

test('content script stays alive on a hosted Ashby apply page', async () => {
  const selectors: string[] = []

  const location = {
    href: 'https://jobs.ashbyhq.com/ashby/job-1/application',
    hostname: 'jobs.ashbyhq.com',
    pathname: '/ashby/job-1/application',
  }
  const body = {
    querySelectorAll() {
      return []
    },
    appendChild() {},
  }
  const documentStub = {
    readyState: 'complete',
    referrer: '',
    body,
    addEventListener() {},
    getElementById() {
      return null
    },
    querySelector() {
      return null
    },
    querySelectorAll(selector: string) {
      selectors.push(selector)
      return { length: 2 }
    },
    createElement() {
      return {
        style: {},
        className: '',
        appendChild() {},
        setAttribute() {},
        addEventListener() {},
        querySelector() {
          return null
        },
      }
    },
  }
  const windowStub = {
    location,
    document: documentStub,
    addEventListener() {},
    top: null as unknown,
  }
  windowStub.top = windowStub

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  }

  Object.assign(globalThis, {
    window: windowStub,
    document: documentStub,
  })

  try {
    const ashby = await import('../utils/siteRules/ashby.ts')
    const ashbyRule = ashby.default()
    assert.equal(ashbyRule.detect(), true)
    assert.equal(ashbyRule.formChanged?.([]), false)
    assert.ok(selectors.some((selector) => selector.includes('.ashby-application-form-container')))
    assert.ok(selectors.some((selector) => selector.includes('.ashby-survey-form-container')))

    location.hostname = 'jobs.lever.co'
    location.href = 'https://jobs.lever.co/acme/role/apply'
    const lever = await import('../utils/siteRules/lever.ts')
    assert.equal(lever.default().detect(), true)

    const entry = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    const listenerAt = entry.indexOf('chrome.runtime.onMessage.addListener(onRuntimeMessage)')
    const initializeAt = entry.indexOf('\n    initialize()')
    assert.ok(listenerAt > 0)
    assert.ok(initializeAt > listenerAt)
    assert.match(entry, /__gofillrContentScript/)
    assert.match(entry, /request\.action === 'autofill'/)
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
  }
})
