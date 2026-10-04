import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { MATCH_SCORE_ID, mountInToastStack, TOAST_STACK_ID } from './toastStack.ts'

test('the Match Score card stays above fill toasts and is not removed with them', () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  const card = doc.createElement('div')
  card.id = MATCH_SCORE_ID
  mountInToastStack(card, 'top', doc)
  const toast = doc.createElement('div')
  toast.className = 'gofillr-autofill-notification'
  mountInToastStack(toast, 'bottom', doc)
  const stack = doc.getElementById(TOAST_STACK_ID)
  assert.ok(stack)
  assert.equal(stack?.children[0]?.id, MATCH_SCORE_ID)
  assert.equal(stack?.children[1]?.className, 'gofillr-autofill-notification')
  doc.querySelectorAll('.gofillr-autofill-notification').forEach((node) => {
    if (node.id === MATCH_SCORE_ID) return
    node.remove()
  })
  assert.ok(doc.getElementById(MATCH_SCORE_ID))
  const style = stack?.getAttribute('style') ?? ''
  assert.match(style, /right:\s*20px/)
  assert.match(style, /bottom:\s*20px/)
  assert.match(style, /gap:\s*8px/)
})
