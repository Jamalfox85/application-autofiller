import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Resolve extensionless and `@/` imports, and transform each file alone so
// module-level `let` stays `let`. A bundle would rewrite those to `var` and
// hide the temporal-dead-zone crash.
register(new URL('./contentScriptResolveHook.mjs', import.meta.url))

const realSetTimeout = globalThis.setTimeout.bind(globalThis)

// initialize() used to read submitAttempt while that let was still below the
// call. Module evaluation then rejected ("Cannot access Re before initialization")
// and the content script never offered the toast, on every site.
test('loading the content script does not reject initialize before submission state exists', async () => {
  const html = readFileSync(new URL('../../fixtures/pages/greenhouse-application.html', import.meta.url), 'utf8')
  const href = 'https://job-boards.greenhouse.io/anthropic/jobs/5238460008'
  const dom = new JSDOM(html, { url: href })
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => {
    rejections.push(reason)
  }
  process.on('unhandledRejection', onRejection)

  const timerStub = () => 0
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    chrome: (globalThis as { chrome?: unknown }).chrome,
    MutationObserver: globalThis.MutationObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout,
    clearInterval: globalThis.clearInterval,
    __GOFILLR_IMPORT_META_ENV__: (globalThis as { __GOFILLR_IMPORT_META_ENV__?: unknown }).__GOFILLR_IMPORT_META_ENV__,
  }

  dom.window.setTimeout = timerStub as typeof dom.window.setTimeout
  dom.window.setInterval = timerStub as typeof dom.window.setInterval
  dom.window.clearTimeout = (() => {}) as typeof dom.window.clearTimeout
  dom.window.clearInterval = (() => {}) as typeof dom.window.clearInterval
  dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 0
  }) as typeof dom.window.requestAnimationFrame

  // Empty storage: signed out, no entitlement cache, plan unknown.
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame,
    setTimeout: timerStub,
    setInterval: timerStub,
    clearTimeout: () => {},
    clearInterval: () => {},
    __GOFILLR_IMPORT_META_ENV__: {},
    chrome: {
      runtime: {
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage() {
          return Promise.resolve({ ok: true })
        },
        getManifest() {
          return { version: '2.0.0' }
        },
      },
      storage: {
        local: {
          async get() {
            return {}
          },
          async set() {},
          async remove() {},
        },
        session: {
          async get() {
            return {}
          },
          async set() {},
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
    },
  })

  try {
    await import('./index.js')
    await new Promise((resolve) => realSetTimeout(resolve, 50))
    const message = rejections
      .map((reason) => (reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)))
      .join('\n')
    assert.equal(rejections.length, 0, message)
    const prompt = dom.window.document.querySelector('.gofillr-autofill-prompt')
    assert.ok(prompt)
    assert.match(prompt?.textContent || '', /Job application detected/)
  } finally {
    process.off('unhandledRejection', onRejection)
    Object.assign(globalThis, previous)
  }
})
