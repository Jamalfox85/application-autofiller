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
  assert.equal(props.failure_reason, undefined)
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

test('Carvana-style hostname + gh_jid tags ats=greenhouse', () => {
  const { props } = buildAutofillContractProps({
    hostname: 'www.carvana.com',
    href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: false,
  })
  assert.equal(props.ats, 'greenhouse')
  assert.equal(props.is_first_fill, true)
  assert.equal(props.minutes_since_install, 1.5)
})

test('empty_profile failed event includes failure_reason without inventing http/status', () => {
  const { props } = buildAutofillContractProps({
    hostname: 'www.carvana.com',
    href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: false,
    failureReason: 'empty_profile',
  })
  assert.equal(props.ats, 'greenhouse')
  assert.equal(props.failure_reason, 'empty_profile')
  assert.equal(props.http, undefined)
  assert.equal(props.status, undefined)
  assert.equal(props.is_first_fill, true)
  assert.equal(props.minutes_since_install, 1.5)
})

test('HTTP failure path may set http/status when provided', () => {
  const { props } = buildAutofillContractProps({
    hostname: 'boards.greenhouse.io',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: false,
    failureReason: 'error',
    http: 503,
    status: 503,
  })
  assert.equal(props.ats, 'greenhouse')
  assert.equal(props.failure_reason, 'error')
  assert.equal(props.http, 503)
  assert.equal(props.status, 503)
})

test('unrelated host without signals stays other', () => {
  const { props } = buildAutofillContractProps({
    hostname: 'careers.example.com',
    href: 'https://careers.example.com/apply',
    now,
    installedAt,
    firstFillAt: null,
    recordSuccess: false,
  })
  assert.equal(props.ats, 'other')
})
