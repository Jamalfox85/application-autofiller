import assert from 'node:assert/strict'
import test from 'node:test'
import { bestOptionIndex } from './optionMatch.ts'

test('prefers an exact Yes/No over a longer visa option', () => {
  const options = ['No', 'Yes, Netherlands Highly Skilled Migrant Visa', 'Yes']
  assert.equal(bestOptionIndex(options, 'Yes'), 2)
  assert.equal(bestOptionIndex(options, 'No'), 0)
})

test('matches a phone-country option that appends a dialing code', () => {
  const options = ['Canada +1', 'United States +1', 'United Kingdom +44']
  assert.equal(bestOptionIndex(options, 'United States'), 1)
})

test('does not treat a short fragment inside Russia as the United States', () => {
  const options = ['Russia', 'Austria', 'United States']
  assert.equal(bestOptionIndex(options, 'United States'), 2)
})

test('picks Computer Science out of a longer major string', () => {
  const options = ['Art', 'Computer Science', 'Engineering']
  assert.equal(bestOptionIndex(options, 'Computer Science and Engineering'), 1)
})

test('returns -1 for an empty query', () => {
  assert.equal(bestOptionIndex(['Yes', 'No'], '  '), -1)
})
