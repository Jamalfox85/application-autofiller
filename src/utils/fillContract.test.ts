import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAutofillContractProps } from './fillContract.ts'

const installedAt = 1_000_000
const now = installedAt + 90_000

test('an attempt before any success is still the first fill', () => {
  const { props, firstFillAtToStore } = buildAutofillContractProps({
    hostname: 'job-boards.greenhouse.io',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: false,
  })
  assert.equal(props.ats, 'greenhouse')
  assert.equal(props.is_first_fill, true)
  assert.equal(props.time_to_first_fill_ms, 90_000)
  assert.equal(props.minutes_since_install, 1.5)
  assert.equal(firstFillAtToStore, null)
})

test('the first success freezes time_to_first_fill_ms from install', () => {
  const { props, firstFillAtToStore } = buildAutofillContractProps({
    hostname: 'jobs.lever.co',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: true,
  })
  assert.equal(props.ats, 'lever')
  assert.equal(props.is_first_fill, true)
  assert.equal(props.time_to_first_fill_ms, 90_000)
  assert.equal(firstFillAtToStore, now)
})

test('later autofill events keep the first-fill duration and clear is_first_fill', () => {
  const firstFillAt = installedAt + 45_000
  const { props, firstFillAtToStore } = buildAutofillContractProps({
    hostname: 'careers.example.com',
    now,
    installedAt,
    firstFillAt,
    recordSuccess: true,
  })
  assert.equal(props.ats, 'other')
  assert.equal(props.is_first_fill, false)
  assert.equal(props.time_to_first_fill_ms, 45_000)
  assert.equal(firstFillAtToStore, null)
})
