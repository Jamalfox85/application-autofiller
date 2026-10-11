import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { JD_TEXT_MAX } from './types.ts'
import { atsExtractorEnabled, matchScoreEnabled } from './flags.ts'
import { extractJobDescription } from './extractors/index.ts'
import { extractBambooHr } from './extractors/bamboohr.ts'
import { extractGreenhouse } from './extractors/greenhouse.ts'
import { extractIcims } from './extractors/icims.ts'
import { extractJobvite } from './extractors/jobvite.ts'
import type { ExtractDocument, ExtractPage } from './extractors/page.ts'
import { matchScoreSurfaceReady } from './extractors/surface.ts'
import { extractWorkday } from './extractors/workday.ts'

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

function fixturePage(file: string, href: string): ExtractPage {
  const html = readFileSync(new URL(`../../../fixtures/pages/${file}`, import.meta.url), 'utf8')
  const dom = new JSDOM(html, { url: href })
  return { href, hostname: new URL(href).hostname, document: dom.window.document }
}

test('feature flags default on for proven extractors and off for the rest', () => {
  assert.equal(matchScoreEnabled(), true)
  assert.equal(matchScoreEnabled('false'), false)
  for (const ats of ['greenhouse', 'ashby', 'lever', 'workable', 'icims']) {
    assert.equal(atsExtractorEnabled(ats), true, ats)
  }
  for (const ats of ['jobvite', 'bamboohr', 'workday']) {
    assert.equal(atsExtractorEnabled(ats), false, ats)
  }
  assert.equal(atsExtractorEnabled('greenhouse', 'false'), false)
  assert.equal(atsExtractorEnabled('icims', 'false'), false)
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

test('Lever overview can start from the posting description and still uses the posting API', async () => {
  const page = fixturePage('lever-job-overview.html', `https://jobs.lever.co/wealthfront/${leverId}`)
  assert.equal(page.document?.querySelector('form'), null)
  assert.match(page.document?.querySelector('[data-qa="job-description"]')?.textContent ?? '', /Android apps/)
  assert.equal(matchScoreSurfaceReady(page.document, page.href), true)
  const urls: string[] = []
  const extraction = await extractJobDescription('lever', page, async (url) => {
    urls.push(url)
    return JSON.stringify(leverFixture)
  })
  assert.deepEqual(urls, [`https://api.lever.co/v0/postings/wealthfront/${leverId}`])
  assert.equal(extraction?.source, 'fetched')
  assert.equal(extraction?.text, 'Build Android apps. Requirements Kotlin')
  assert.equal(extraction?.text.includes('salary range'), false)
  const board = fixturePage('lever-board.html', 'https://jobs.lever.co/wealthfront')
  assert.equal(matchScoreSurfaceReady(board.document, board.href), false)
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

test('Workable uses the widget accounts endpoint and the job description', async () => {
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
  assert.deepEqual(urls, ['https://apply.workable.com/api/v1/widget/accounts/acely?details=true'])
  assert.equal(extraction?.text, 'Teach students with the product.')
  assert.equal(extraction?.text.includes('Account level blurb'), false)
})

const notionJob = 'https://jobs.ashbyhq.com/notion/1fc309c8-da20-4ff2-84c7-8b863ece2b0a'
const notionJd = 'Who We Are\nNotion is the collaborative workspace.\nBuild reliable platform tools.'

test('Ashby overview and apply read the posting from the page and keep line breaks', async () => {
  let calls = 0
  const fetchPosting = async () => {
    calls += 1
    return JSON.stringify(ashbyFixture)
  }
  const overview = fixturePage('ashby-job-overview.html', notionJob)
  const apply = fixturePage('ashby-job-apply.html', `${notionJob}/application`)
  assert.equal(matchScoreSurfaceReady(overview.document, overview.href), true)
  assert.equal(overview.document?.querySelector('form'), null)
  assert.equal(matchScoreSurfaceReady(apply.document, apply.href), true)
  assert.equal(apply.document?.querySelector('form'), null)
  for (const page of [overview, apply]) {
    const extraction = await extractJobDescription('ashby', page, fetchPosting)
    assert.equal(extraction?.source, 'dom')
    assert.equal(extraction?.text, notionJd)
    assert.equal(extraction?.text.includes('Upload your resume'), false)
    assert.equal(extraction?.jobUrl, page.href)
  }
  const board = fixturePage('ashby-board.html', 'https://jobs.ashbyhq.com/notion')
  assert.equal(matchScoreSurfaceReady(board.document, board.href), false)
  assert.equal(await extractJobDescription('ashby', board, fetchPosting), null)
  assert.equal(calls, 0)
})

test('Ashby posting text keeps paragraph breaks when the page has no description', async () => {
  const extraction = await extractJobDescription(
    'ashby',
    {
      href: `https://jobs.ashbyhq.com/ashby/${ashbyId}/application`,
      hostname: 'jobs.ashbyhq.com',
    },
    async () =>
      JSON.stringify({
        jobs: [
          {
            id: ashbyId,
            descriptionPlain: 'Who We Are\n\nBuild the hiring product.',
            descriptionHtml: '<p>ignored when plain text is present</p>',
          },
        ],
      }),
  )
  assert.equal(extraction?.source, 'fetched')
  assert.equal(extraction?.text, 'Who We Are\n\nBuild the hiring product.')
})

test('Workable apply fetches the widget when the overview sections are absent', async () => {
  const urls: string[] = []
  const page = fixturePage(
    'workable-application.html',
    'https://apply.workable.com/huggingface/j/81B46579FE/apply/',
  )
  assert.equal(matchScoreSurfaceReady(page.document, page.href), true)
  const extraction = await extractJobDescription('workable', page, async (url) => {
    urls.push(url)
    return JSON.stringify({
      jobs: [{ shortcode: '81B46579FE', description: '<p>Build open models.</p><p>Ship libraries.</p>' }],
    })
  })
  assert.deepEqual(urls, ['https://apply.workable.com/api/v1/widget/accounts/huggingface?details=true'])
  assert.equal(extraction?.source, 'fetched')
  assert.equal(extraction?.text, 'Build open models.\nShip libraries.')
})

test('Workable overview reads the description sections and does not fetch', async () => {
  let calls = 0
  const page = fixturePage(
    'workable-job-overview.html',
    'https://apply.workable.com/huggingface/j/81B46579FE/',
  )
  assert.equal(page.document?.querySelector('form'), null)
  assert.equal(matchScoreSurfaceReady(page.document, page.href), true)
  const extraction = await extractJobDescription('workable', page, async () => {
    calls += 1
    return JSON.stringify(workableFixture)
  })
  assert.equal(calls, 0)
  assert.equal(extraction?.source, 'dom')
  assert.equal(
    extraction?.text,
    'Description\n\nBuild open models with the research team.\n\nShip libraries used by the community.\n\nRequirements\n\nTell us about open-source work.',
  )
  assert.equal(extraction?.text.includes('Open-Source Machine Learning Engineer'), false)
})

const ICIMS_JOB = 'https://careers-healthedge.icims.com/jobs/8287/software-engineer---performance-and-tools/job'
const ICIMS_FRAME = `${ICIMS_JOB}?in_iframe=1`

test('iCIMS reads the job content frame and not the shell, login, or candidate documents', async () => {
  let calls = 0
  const fetchPosting = async () => {
    calls += 1
    return '{}'
  }
  const frame = fixturePage('icims-job-frame.html', ICIMS_FRAME)
  const extraction = await extractJobDescription('icims', frame, fetchPosting)
  assert.equal(extraction?.text, 'Build performance tooling.')
  assert.equal(extraction?.source, 'dom')
  assert.equal(extraction?.jobUrl, ICIMS_FRAME)
  assert.equal(extraction?.text.includes('Apply'), false)
  assert.equal(extraction?.text.includes('Performance and Tools'), false)
  assert.deepEqual(await extractIcims(frame), extraction)

  const shell = fixturePage('icims-job-shell.html', ICIMS_JOB)
  assert.match(shell.document?.querySelector('#icims_content_iframe')?.getAttribute('src') ?? '', /in_iframe=1/)
  assert.equal(shell.document?.querySelector('.iCIMS_JobContent'), null)
  assert.equal(await extractJobDescription('icims', shell, fetchPosting), null)
  assert.equal(matchScoreSurfaceReady(frame.document), true)
  assert.equal(matchScoreSurfaceReady(shell.document), false)

  const quiet = [
    fixturePage('icims-application.html', 'https://careers-kemin.icims.com/jobs/12279/global-erp-business-analyst/candidate?in_iframe=1'),
    fixturePage('icims-candidate-frame.html', 'https://careers-peraton.icims.com/jobs/168754/iam-software-engineer/candidate?in_iframe=1'),
    fixturePage('icims-login-frame.html', 'https://careers-healthedge.icims.com/jobs/8287/software-engineer---performance-and-tools/login?in_iframe=1'),
    fixturePage('icims-password-frame.html', 'https://careers-powerschool.icims.com/jobs/53014/senior-software-engineer-i/login?in_iframe=1'),
  ]
  for (const page of quiet) {
    assert.equal(page.document?.querySelector('.iCIMS_JobContent'), null, page.href)
    assert.equal(matchScoreSurfaceReady(page.document), true, page.href)
    assert.equal(await extractIcims(page), null, page.href)
    assert.equal(await extractJobDescription('icims', page, fetchPosting), null, page.href)
  }
  assert.equal(calls, 0)
})

test('Jobvite, BambooHR, and Workday captured pages have no readable description and do not fetch', async () => {
  let calls = 0
  const fetchPosting = async () => {
    calls += 1
    return '{}'
  }

  const jobviteShell = fixturePage('jobvite-apply-shell.html', 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply')
  assert.match(jobviteShell.document?.querySelector('.jv-header')?.textContent ?? '', /Software Engineer/)
  assert.equal(await extractJobvite(jobviteShell), null)
  assert.equal(await extractJobDescription('jobvite', jobviteShell, fetchPosting), null)
  assert.equal(
    await extractJobvite(fixturePage('jobvite-application.html', 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply')),
    null,
  )
  assert.equal(await extractJobvite(fixturePage('jobvite-board.html', 'https://jobs.jobvite.com/uplight')), null)

  const bambooApply = fixturePage('bamboohr-application.html', 'https://acme.bamboohr.com/careers/42')
  assert.equal(await extractBambooHr(bambooApply), null)
  assert.equal(await extractJobDescription('bamboohr', bambooApply, fetchPosting), null)
  assert.equal(await extractBambooHr(fixturePage('bamboohr-listing.html', 'https://acme.bamboohr.com/careers')), null)
  const bambooEmpty = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url: 'https://acme.bamboohr.com/careers/42',
  })
  assert.equal(
    await extractBambooHr({
      href: 'https://acme.bamboohr.com/careers/42',
      hostname: 'acme.bamboohr.com',
      document: bambooEmpty.window.document,
    }),
    null,
  )

  const workdayApply = fixturePage(
    'workday-application.html',
    'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787/apply',
  )
  assert.equal(workdayApply.document?.querySelector('[data-automation-id="applyFlowPage"]') != null, true)
  assert.equal(await extractWorkday(workdayApply), null)
  assert.equal(await extractJobDescription('workday', workdayApply, fetchPosting), null)
  assert.equal(
    await extractWorkday(
      fixturePage(
        'workday-search.html',
        'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787',
      ),
    ),
    null,
  )
  const workdaySpa = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787/apply',
  })
  assert.equal(
    await extractWorkday({
      href: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787/apply',
      hostname: 'cisco.wd5.myworkdayjobs.com',
      document: workdaySpa.window.document,
    }),
    null,
  )
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
