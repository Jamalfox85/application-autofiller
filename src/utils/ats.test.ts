import assert from 'node:assert/strict'
import test from 'node:test'
import { atsFromHostname } from './ats.ts'

test('maps Greenhouse job-board hosts', () => {
  assert.equal(atsFromHostname('job-boards.greenhouse.io'), 'greenhouse')
  assert.equal(atsFromHostname('boards.greenhouse.io'), 'greenhouse')
})

test('maps other known ATS hosts and ignores everyone else', () => {
  assert.equal(atsFromHostname('jobs.lever.co'), 'lever')
  assert.equal(atsFromHostname('company.wd5.myworkdayjobs.com'), 'workday')
  assert.equal(atsFromHostname('jobs.ashbyhq.com'), 'ashby')
  assert.equal(atsFromHostname('careers.example.com'), null)
})
