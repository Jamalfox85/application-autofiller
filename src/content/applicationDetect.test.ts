import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

import {
  AUTOFILL_PROMPT_COPY,
  renderAutofillPrompt,
} from './applicationPrompt.ts'
import {
  detectApplicationPage,
  detectApplicationPageWhenReady,
  type ApplicationPageDetection,
} from './applicationDetect.ts'

const PROMPT = '.gofillr-autofill-prompt'

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/pages/${name}`, import.meta.url), 'utf8')
}

// Same decision the content script uses before showAutofillPrompt: a detected
// page mounts the offer; a board or a form that never arrives does not.
async function offer(
  href: string,
  html: string,
  options: {
    timeoutMs?: number
    stepMs?: number
    afterFirstRead?: (document: Document) => void
  } = {},
): Promise<{ detection: ApplicationPageDetection; prompt: Element | null; document: Document }> {
  const dom = new JSDOM(html, { url: href })
  const document = dom.window.document
  let reads = 0
  const detection = await detectApplicationPageWhenReady(
    () => {
      reads += 1
      if (reads === 2) options.afterFirstRead?.(document)
      return detectApplicationPage({ href, document })
    },
    async () => {},
    { timeoutMs: options.timeoutMs ?? 0, stepMs: options.stepMs ?? 1 },
  )
  if (detection.detected) renderAutofillPrompt(document)
  return { detection, prompt: document.querySelector(PROMPT), document }
}

const quiet: Array<{ name: string; file: string; href: string }> = [
  {
    name: 'Greenhouse board index',
    file: 'greenhouse-board-listing.html',
    href: 'https://job-boards.greenhouse.io/anthropic',
  },
  {
    name: 'classic Greenhouse board',
    file: 'greenhouse-board-listing.html',
    href: 'https://boards.greenhouse.io/anthropic',
  },
  {
    name: 'Greenhouse embed job board',
    file: 'greenhouse-embed-board.html',
    href: 'https://boards.greenhouse.io/embed/job_board?for=anthropic',
  },
  {
    name: 'Ashby board',
    file: 'ashby-board.html',
    href: 'https://jobs.ashbyhq.com/ashby',
  },
  {
    name: 'Lever board',
    file: 'lever-board.html',
    href: 'https://jobs.lever.co/wealthfront',
  },
  {
    name: 'Jobvite board',
    file: 'jobvite-board.html',
    href: 'https://jobs.jobvite.com/uplight',
  },
  {
    name: 'Workable company index',
    file: 'workable-board.html',
    href: 'https://apply.workable.com/acely',
  },
  {
    name: 'iCIMS search',
    file: 'icims-search.html',
    href: 'https://careers-kemin.icims.com/jobs/search',
  },
  {
    name: 'Workday search',
    file: 'workday-search.html',
    href: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers',
  },
  {
    name: 'BambooHR careers index',
    file: 'bamboohr-listing.html',
    href: 'https://acme.bamboohr.com/careers',
  },
  {
    name: 'Workable job-list widget',
    file: 'workable-job-list-widget.html',
    href: 'https://www.acme.com/careers',
  },
]

const loud: Array<{ name: string; file: string; href: string }> = [
  {
    name: 'Greenhouse job application',
    file: 'greenhouse-application.html',
    href: 'https://job-boards.greenhouse.io/anthropic/jobs/5183044008',
  },
  {
    name: 'Greenhouse embed application',
    file: 'greenhouse-embed-application.html',
    href: 'https://boards.greenhouse.io/embed/job_app?for=gitlab&token=8860302002',
  },
  {
    name: 'Greenhouse form embedded on a company site',
    file: 'greenhouse-company-inline.html',
    href: 'https://www.carvana.com/careers/apply?gh_jid=8220620',
  },
  {
    name: 'Ashby application',
    file: 'ashby-application.html',
    href: 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application',
  },
  {
    name: 'Lever application',
    file: 'lever-application.html',
    href: 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5/apply',
  },
  {
    name: 'Jobvite application',
    file: 'jobvite-application.html',
    href: 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply',
  },
  {
    name: 'Workable application',
    file: 'workable-application.html',
    href: 'https://apply.workable.com/acely/j/876996D5A3/apply/',
  },
  {
    name: 'Workable application on a custom domain',
    file: 'workable-application.html',
    href: 'https://careers.acme.com/j/876996D5A3/apply',
  },
  {
    name: 'iCIMS candidate application',
    file: 'icims-application.html',
    href: 'https://careers-kemin.icims.com/jobs/12279/global-erp-business-analyst/candidate?in_iframe=1',
  },
  {
    name: 'Workday application',
    file: 'workday-application.html',
    href: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787/apply',
  },
  {
    name: 'BambooHR application',
    file: 'bamboohr-application.html',
    href: 'https://acme.bamboohr.com/careers/42',
  },
]

for (const page of quiet) {
  test(`${page.name} does not show the autofill toast`, async () => {
    const { detection, prompt } = await offer(page.href, fixture(page.file))
    assert.equal(detection.detected, false)
    assert.equal(detection.pending, false)
    assert.equal(prompt, null)
  })
}

for (const page of loud) {
  test(`${page.name} shows the autofill toast`, async () => {
    const { detection, prompt } = await offer(page.href, fixture(page.file))
    assert.equal(detection.detected, true)
    assert.ok(detection.fieldCount >= 1)
    assert.ok(prompt)
    assert.match(prompt.textContent || '', new RegExp(AUTOFILL_PROMPT_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
}

test('a Greenhouse board stays quiet even when extra filters are fillable', async () => {
  const href = 'https://job-boards.greenhouse.io/anthropic'
  const dom = new JSDOM(fixture('greenhouse-board-listing.html'), { url: href })
  const filters = dom.window.document.querySelector('.filters')
  assert.ok(filters)
  for (let i = 0; i < 8; i += 1) {
    const input = dom.window.document.createElement('input')
    input.type = 'text'
    filters.appendChild(input)
  }
  const detection = detectApplicationPage({ href, document: dom.window.document })
  assert.equal(detection.detected, false)
  assert.equal(detection.pending, false)
  assert.ok(detection.fieldCount >= 8)
})

test('a company page that only iframes Greenhouse does not toast in the parent', async () => {
  const href = 'https://www.carvana.com/careers/apply?gh_jid=8220620'
  const { detection, prompt } = await offer(href, fixture('greenhouse-company-iframe.html'))
  assert.equal(detection.detected, false)
  assert.equal(detection.pending, false)
  assert.equal(prompt, null)
})

test('a Greenhouse application form that mounts late still shows the toast', async () => {
  const href = 'https://job-boards.greenhouse.io/anthropic/jobs/5183044008'
  const { detection, prompt } = await offer(href, '<!doctype html><html><body><p>Loading</p></body></html>', {
    timeoutMs: 3,
    stepMs: 1,
    afterFirstRead(document) {
      document.body.innerHTML = fixture('greenhouse-application.html')
    },
  })
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'form')
  assert.ok(prompt)
  assert.match(prompt.textContent || '', /Job application detected/)
})

test('an Ashby application form that mounts late still shows the toast', async () => {
  const href = 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application'
  const { detection, prompt } = await offer(href, '<!doctype html><body></body>', {
    timeoutMs: 3,
    stepMs: 1,
    afterFirstRead(document) {
      document.body.innerHTML = fixture('ashby-application.html')
    },
  })
  assert.equal(detection.detected, true)
  assert.ok(prompt)
})

test('a known apply URL with no form after the retry does not toast', async () => {
  const href = 'https://boards.greenhouse.io/embed/job_app?for=gitlab&token=11'
  const { detection, prompt } = await offer(href, '<!doctype html><body><p>Still loading</p></body></html>', {
    timeoutMs: 2,
    stepMs: 1,
  })
  assert.equal(detection.detected, false)
  assert.equal(detection.pending, false)
  assert.equal(prompt, null)
})

test('a form marker with a single fillable field still shows the toast', async () => {
  const href = 'https://job-boards.greenhouse.io/anthropic/jobs/5183044008'
  const html = `<!doctype html><body><form id="application-form"><input id="first_name" type="text" /></form></body>`
  const { detection, prompt } = await offer(href, html)
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'form')
  assert.equal(detection.fieldCount, 1)
  assert.ok(prompt)
})

test('four fillable fields on a known apply URL show the toast without a form marker', async () => {
  const href = 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5/apply'
  const html = `<!doctype html><body>
    <input id="a" /><input id="b" /><input id="c" /><input id="d" type="email" />
  </body>`
  const { detection, prompt } = await offer(href, html)
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'url_pattern')
  assert.ok(prompt)
})

test('three fields and no marker on an apply URL do not toast', async () => {
  const href = 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5/apply'
  const html = `<!doctype html><body><input id="a" /><input id="b" /><input id="c" /></body>`
  const { detection, prompt } = await offer(href, html, { timeoutMs: 2, stepMs: 1 })
  assert.equal(detection.detected, false)
  assert.equal(prompt, null)
})

test('an iCIMS job description is not an application', async () => {
  const href = 'https://careers-kemin.icims.com/jobs/12279/global-erp-business-analyst/job'
  const { detection, prompt } = await offer(href, fixture('icims-search.html'))
  assert.equal(detection.detected, false)
  assert.equal(prompt, null)
})

test('the content script offers the toast only after application detection', () => {
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  assert.match(index, /detectApplicationPage/)
  assert.match(index, /detectApplicationPageWhenReady/)
  assert.equal(/if \(isJobPlatform\) \{\s*return \{ detected: true/.test(index), false)
  assert.match(notifications, /renderAutofillPrompt\(document\)/)
  assert.match(notifications, /await autofillPage\(\)/)
})
