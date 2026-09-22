import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atsFromHostname,
  detectAts,
  documentHasGreenhouseMarkers,
  hrefHasGreenhouseJobId,
} from './ats.ts'

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

test('Carvana-style careers host with gh_jid is greenhouse', () => {
  assert.equal(
    detectAts({
      hostname: 'www.carvana.com',
      href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
    }),
    'greenhouse',
  )
  assert.equal(
    hrefHasGreenhouseJobId('https://www.carvana.com/careers/apply?gh_jid=8220620&gh_src=xyz'),
    true,
  )
})

test('boards.greenhouse.io hostname is still greenhouse without gh_jid', () => {
  assert.equal(
    detectAts({ hostname: 'boards.greenhouse.io', href: 'https://boards.greenhouse.io/acme/jobs/1' }),
    'greenhouse',
  )
})

test('unrelated host without Greenhouse signals stays null', () => {
  assert.equal(
    detectAts({
      hostname: 'careers.example.com',
      href: 'https://careers.example.com/apply?job=123',
    }),
    null,
  )
  assert.equal(atsFromHostname('www.carvana.com'), null)
})

test('Greenhouse DOM markers detect embeds without gh_jid', () => {
  const doc = {
    getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
    querySelector: () => null,
  }
  assert.equal(documentHasGreenhouseMarkers(doc), true)
  assert.equal(
    detectAts({ hostname: 'www.carvana.com', href: 'https://www.carvana.com/careers/apply', document: doc }),
    'greenhouse',
  )
})
