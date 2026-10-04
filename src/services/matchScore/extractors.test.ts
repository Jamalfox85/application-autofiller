import assert from 'node:assert/strict'
import test from 'node:test'
import { JD_TEXT_MAX } from './types.ts'
import { atsExtractorEnabled, matchScoreEnabled } from './flags.ts'
import { extractJobDescription } from './extractors/index.ts'
import { extractGreenhouse } from './extractors/greenhouse.ts'
import { extractJobvite } from './extractors/jobvite.ts'
import type { ExtractDocument } from './extractors/page.ts'

function pageDoc(map: Record<string, { text?: string; src?: string }>): ExtractDocument {
  return {
    querySelector(selector: string) {
      const found = map[selector]
      if (!found) return null
      return {
        textContent: found.text ?? '',
        getAttribute(name: string) {
          return name === 'src' ? (found.src ?? null) : null
        },
      }
    },
  }
}

const greenhouseFixture = {
  id: 8860302002,
  title: 'Engineer',
  content: '&lt;p&gt;Build reliable systems.&lt;/p&gt;',
  questions: [{ label: 'First Name', fields: [{ name: 'first_name', type: 'input_text' }] }],
}

const leverId = '78d6f6d5-1f08-4d5d-87be-c4250567bfb5'
const leverFixture = {
  id: leverId,
  descriptionPlain: 'Build Android apps.',
  description: '<p>Build Android apps.</p>',
  additional: 'Do not include this closing.',
  lists: [{ text: 'Requirements', content: '<li>Kotlin</li>' }],
}

const ashbyId = '7458d4e9-da2e-47bd-98cb-adfda43d42b2'
const ashbyFixture = {
  apiVersion: '1',
  jobs: [
    {
      id: 'other-job',
      descriptionPlain: 'Not this job',
      descriptionHtml: '<p>Not this job</p>',
    },
    {
      id: ashbyId,
      descriptionPlain: 'Join the Ashby team.',
      descriptionHtml: '<p>Join the Ashby team.</p>',
      applyUrl: `https://jobs.ashbyhq.com/ashby/${ashbyId}/application`,
    },
  ],
}

const workableFixture = {
  name: 'Acely',
  description: '<p>Account level blurb that is not the job.</p>',
  jobs: [
    {
      shortcode: '876996D5A3',
      title: 'Tutor',
      description: '<p>Teach students with the product.</p>',
    },
  ],
}

test('feature flags default on for proven extractors and off for the rest', () => {
  assert.equal(matchScoreEnabled(), true)
  assert.equal(matchScoreEnabled('false'), false)
  for (const ats of ['greenhouse', 'ashby', 'lever', 'workable']) {
    assert.equal(atsExtractorEnabled(ats), true, ats)
  }
  for (const ats of ['jobvite', 'bamboohr', 'icims', 'workday']) {
    assert.equal(atsExtractorEnabled(ats), false, ats)
  }
  assert.equal(atsExtractorEnabled('greenhouse', 'false'), false)
})

test('hosted Greenhouse uses the job description element and ignores other page text', async () => {
  let called = false
  const extraction = await extractGreenhouse(
    {
      href: 'https://job-boards.greenhouse.io/gitlab/jobs/8860302002',
      hostname: 'job-boards.greenhouse.io',
      document: pageDoc({
        '.job__description': { text: 'Build reliable systems' },
        body: { text: 'Apply now for this unrelated banner' },
      }),
    },
    async () => {
      called = true
      return null
    },
  )
  assert.equal(called, false)
  assert.deepEqual(extraction, {
    text: 'Build reliable systems',
    source: 'dom',
    jobUrl: 'https://job-boards.greenhouse.io/gitlab/jobs/8860302002',
  })
})

test('Greenhouse embeds fetch the documented job endpoint and decode content HTML', async () => {
  const urls: string[] = []
  const extraction = await extractGreenhouse(
    {
      href: 'https://boards.greenhouse.io/embed/job_app?for=gitlab&token=8860302002',
      hostname: 'boards.greenhouse.io',
      document: pageDoc({ body: { text: 'First Name' } }),
    },
    async (url) => {
      urls.push(url)
      return JSON.stringify(greenhouseFixture)
    },
  )
  assert.deepEqual(urls, ['https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/8860302002'])
  assert.equal(extraction?.source, 'fetched')
  assert.equal(extraction?.text, 'Build reliable systems.')
  assert.equal(extraction?.text.includes('First Name'), false)
})

test('gh_jid without a board does not fetch, and an embed iframe does', async () => {
  let calls = 0
  const missing = await extractGreenhouse(
    {
      href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
      hostname: 'www.carvana.com',
      document: pageDoc({}),
    },
    async () => {
      calls += 1
      return null
    },
  )
  assert.equal(missing, null)
  assert.equal(calls, 0)

  const found = await extractGreenhouse(
    {
      href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
      hostname: 'www.carvana.com',
      document: pageDoc({
        'iframe[src*="greenhouse.io"]': {
          src: 'https://boards.greenhouse.io/embed/job_app?for=carvana&token=8220620',
        },
      }),
    },
    async () => JSON.stringify(greenhouseFixture),
  )
  assert.equal(found?.text, 'Build reliable systems.')
  assert.equal(found?.source, 'fetched')
})

test('Lever uses description and lists from the documented posting', async () => {
  const urls: string[] = []
  const extraction = await extractJobDescription(
    'lever',
    {
      href: `https://jobs.lever.co/wealthfront/${leverId}/apply`,
      hostname: 'jobs.lever.co',
    },
    async (url) => {
      urls.push(url)
      return JSON.stringify(leverFixture)
    },
  )
  assert.deepEqual(urls, [`https://api.lever.co/v0/postings/wealthfront/${leverId}`])
  assert.equal(extraction?.text, 'Build Android apps. Requirements Kotlin')
  assert.equal(extraction?.text.includes('Do not include this closing'), false)

  const eu = await extractJobDescription(
    'lever',
    { href: `https://jobs.eu.lever.co/acme/${leverId}/apply`, hostname: 'jobs.eu.lever.co' },
    async (url) => {
      urls.push(url)
      return JSON.stringify(leverFixture)
    },
  )
  assert.equal(urls[1], `https://api.eu.lever.co/v0/postings/acme/${leverId}`)
  assert.ok(eu?.text)
})

test('Ashby picks the job id from the public job board', async () => {
  const urls: string[] = []
  const extraction = await extractJobDescription(
    'ashby',
    {
      href: `https://jobs.ashbyhq.com/ashby/${ashbyId}/application`,
      hostname: 'jobs.ashbyhq.com',
    },
    async (url) => {
      urls.push(url)
      return JSON.stringify(ashbyFixture)
    },
  )
  assert.deepEqual(urls, ['https://api.ashbyhq.com/posting-api/job-board/ashby'])
  assert.equal(extraction?.text, 'Join the Ashby team.')
  assert.equal(extraction?.text.includes('Not this job'), false)
})

test('Workable uses the documented accounts endpoint and the job description', async () => {
  const urls: string[] = []
  const extraction = await extractJobDescription(
    'workable',
    {
      href: 'https://apply.workable.com/acely/j/876996D5A3/apply/',
      hostname: 'apply.workable.com',
    },
    async (url) => {
      urls.push(url)
      return JSON.stringify(workableFixture)
    },
  )
  assert.deepEqual(urls, ['https://www.workable.com/api/accounts/acely?details=true'])
  assert.equal(extraction?.text, 'Teach students with the product.')
  assert.equal(extraction?.text.includes('Account level blurb'), false)
})

test('Jobvite, BambooHR, iCIMS, and Workday do not fetch', async () => {
  let calls = 0
  const fetchPosting = async () => {
    calls += 1
    return '{}'
  }
  assert.equal(await extractJobvite(), null)
  assert.equal(
    await extractJobDescription(
      'jobvite',
      { href: 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply', hostname: 'jobs.jobvite.com' },
      fetchPosting,
    ),
    null,
  )
  for (const ats of ['bamboohr', 'icims', 'workday']) {
    assert.equal(
      await extractJobDescription(ats, { href: 'https://example.com/apply', hostname: 'example.com' }, fetchPosting),
      null,
      ats,
    )
  }
  assert.equal(calls, 0)
})

test('fetched descriptions are capped at 30000 characters', async () => {
  const extraction = await extractGreenhouse(
    {
      href: 'https://boards.greenhouse.io/embed/job_app?for=gitlab&token=11',
      hostname: 'boards.greenhouse.io',
    },
    async () => JSON.stringify({ content: `<p>${'A'.repeat(JD_TEXT_MAX + 50)}</p>` }),
  )
  assert.equal(extraction?.text.length, JD_TEXT_MAX)
})
