import assert from 'node:assert/strict'
import test from 'node:test'
import { outcomeOnLeave } from './applySessionOutcome.ts'

test('a visit with no fill attempt is an abandon', () => {
  assert.equal(outcomeOnLeave({ settled: null, sawFailure: false }), 'abandon')
})

test('a failed fill that never recovered is a fail once the page is left', () => {
  assert.equal(outcomeOnLeave({ settled: null, sawFailure: true }), 'fail')
})

test('success already emitted is not overwritten on leave', () => {
  assert.equal(outcomeOnLeave({ settled: 'success', sawFailure: true }), null)
})
