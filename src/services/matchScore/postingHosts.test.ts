import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchAllowedPosting } from './fetchPosting.ts'
import { POSTING_HOSTS, postingUrlAllowed } from './postingHosts.ts'

test('posting fetches stay on the confirmed hosts', async () => {
  assert.equal(postingUrlAllowed('https://boards-api.greenhouse.io/v1/boards/acme/jobs/1'), true)
  assert.equal(postingUrlAllowed('https://api.lever.co/v0/postings/acme/id'), true)
  assert.equal(postingUrlAllowed('https://api.eu.lever.co/v0/postings/acme/id'), true)
  assert.equal(postingUrlAllowed('https://api.ashbyhq.com/posting-api/job-board/acme'), true)
  assert.equal(postingUrlAllowed('https://www.workable.com/api/accounts/acely?details=true'), true)
  assert.equal(postingUrlAllowed('https://api.jobvite.com/v1/jobFeed'), false)
  assert.equal(postingUrlAllowed('https://evil.example/job'), false)
  assert.equal(postingUrlAllowed('http://boards-api.greenhouse.io/v1/boards/acme/jobs/1'), false)

  let called = false
  const blocked = await fetchAllowedPosting('https://evil.example/job', async () => {
    called = true
    throw new Error('blocked host was fetched')
  })
  assert.equal(blocked.ok, false)
  assert.equal(called, false)

  const allowed = await fetchAllowedPosting('https://api.lever.co/v0/postings/acme/id', async (_url, init) => {
    assert.equal(init?.method, 'GET')
    return new Response('{"ok":true}', { status: 200 })
  })
  assert.equal(allowed.ok, true)
  if (allowed.ok) assert.match(allowed.body, /ok/)
})

test('the service worker relays Match Score and allows the posting hosts', () => {
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const worker = readFileSync(new URL('../matchScoreWorker.ts', import.meta.url), 'utf8')
  const manifest = readFileSync(new URL('../../../manifest.json', import.meta.url), 'utf8')
  assert.match(background, /handleMatchScoreMessage/)
  assert.match(background, /fetchJobPosting/)
  assert.match(background, /matchScoreAddSkill/)
  assert.match(background, /matchScoreRemoveSkill/)
  assert.match(worker, /frameId:\s*0/)
  assert.match(worker, /buildMatchProfile/)
  assert.match(worker, /resumeApiBaseUrl/)
  assert.match(worker, /getValidAccessToken/)
  assert.doesNotMatch(worker, /api-production-5aca1/)
  assert.doesNotMatch(worker, /Bearer [A-Za-z0-9]/)
  for (const host of POSTING_HOSTS) {
    assert.match(manifest, new RegExp(host.replace(/\./g, '\\.')))
  }
  assert.doesNotMatch(manifest, /api\.jobvite\.com/)
})
