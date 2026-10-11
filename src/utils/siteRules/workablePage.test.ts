import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  watchWorkableApplication,
  workableApplicationFailed,
  WORKABLE_PAGE_FAILED_MESSAGE,
} from './workablePage.ts'

function doc(html: string): Document {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document
}

test('a mounted Workable form is not the error page', () => {
  const page = doc('<form data-ui="application-form"><input name="email"></form>')
  assert.equal(workableApplicationFailed(page), false)
})

test('the error sentence inside a still-mounted form is not a crash', () => {
  const page = doc(
    '<form data-ui="application-form"><p>Sorry, an unknown error occurred in a previous attempt.</p></form>',
  )
  assert.equal(workableApplicationFailed(page), false)
})

test('the unknown-error route with no application form is a failed fill', () => {
  const page = doc(
    '<h1>Sorry, an unknown error occurred.</h1><p>The page you are looking for might have been removed.</p><a>Go to homepage</a>',
  )
  assert.equal(workableApplicationFailed(page), true)
  assert.match(WORKABLE_PAGE_FAILED_MESSAGE, /error page/)
})

test('an eeoc form that is still mounted is not a crash', () => {
  const page = doc('<form data-ui="eeoc-form"><input name="gender"></form>')
  assert.equal(workableApplicationFailed(page), false)
})

test('a homepage link without the error title is not a crash', () => {
  const page = doc('<a>Go to homepage</a>')
  assert.equal(workableApplicationFailed(page), false)
})

test('the watch reports a failure when the form is replaced by the error page', async () => {
  const dom = new JSDOM('<!doctype html><body><form data-ui="application-form"></form></body>')
  const page = dom.window.document
  let failed = 0
  const stop = watchWorkableApplication(page, () => {
    failed += 1
  }, { intervalMs: 20, timeoutMs: 500 })
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(failed, 0)
  page.body.innerHTML =
    '<h1>Sorry, an unknown error occurred.</h1><a>Go to homepage</a>'
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(failed, 1)
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(failed, 1)
  stop()
})
