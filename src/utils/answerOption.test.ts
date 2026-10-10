import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>')
const w = dom.window as unknown as Record<string, unknown>
for (const k of ['window', 'document', 'KeyboardEvent', 'FocusEvent', 'MouseEvent', 'InputEvent', 'Event', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : w[k], configurable: true, writable: true })
}
const { pickExactAnswerOption } = await import('./inputHandlers.ts')

test('answer picker takes exact or whole-word-prefix options only', () => {
  assert.equal(pickExactAnswerOption(['Yes', 'No'], 'yes'), 'Yes')
  assert.equal(pickExactAnswerOption(['Not applicable', 'No'], 'No'), 'No')
  assert.equal(pickExactAnswerOption(['Not applicable'], 'No'), null)
  assert.equal(pickExactAnswerOption(['Yes, I am 18 or older', 'No'], 'Yes'), 'Yes, I am 18 or older')
  assert.equal(pickExactAnswerOption(['Full Stack Developer'], 'Yes'), null)
  assert.equal(pickExactAnswerOption(['LinkedIn', 'Job board'], 'LinkedIn'), 'LinkedIn')
  assert.equal(pickExactAnswerOption(['Yes'], ''), null)
})
