import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

import {
  AUTOFILL_PROMPT_COPY,
  renderAutofillPrompt,
} from './applicationPrompt.ts'
import {
  countFillableFields,
  detectApplicationPage,
  detectApplicationPageWhenReady,
  shouldOfferAutofillToast,
  type ApplicationPageDetection,
} from './applicationDetect.ts'
import {
  connectedAutofillPrompt,
  markAutofillPromptClosed,
  resetAutofillPromptSession,
  scheduleAutofillPromptRestore,
} from './applicationPrompt.ts'

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
    /** True when this document is the iCIMS ?in_iframe=1 frame, not the top window. */
    embedded?: boolean
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
  if (shouldOfferAutofillToast(href, detection, options.embedded ?? false)) renderAutofillPrompt(document)
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
    name: 'Greenhouse job-boards application',
    file: 'greenhouse-application.html',
    href: 'https://job-boards.greenhouse.io/anthropic/jobs/5238460008',
  },
  {
    name: 'classic Greenhouse job application',
    file: 'greenhouse-application.html',
    href: 'https://boards.greenhouse.io/anthropic/jobs/5238460008',
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

test('an iCIMS search page is not an application', async () => {
  const search = 'https://careers-kemin.icims.com/jobs/search'
  const { detection, prompt } = await offer(search, fixture('icims-search.html'))
  assert.equal(detection.detected, false)
  assert.equal(prompt, null)
})

test('a classic Greenhouse #application_form id still prompts', async () => {
  const href = 'https://boards.greenhouse.io/embed/job_app?for=gitlab&token=11'
  const html = `<!doctype html><body><form id="application_form"><input id="first_name" type="text" /></form></body>`
  const { detection, prompt } = await offer(href, html)
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'form')
  assert.ok(prompt)
})

test('the content script offers the toast only after application detection', () => {
  const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const notifications = readFileSync(new URL('./notifications.ts', import.meta.url), 'utf8')
  assert.match(index, /detectApplicationPage/)
  assert.match(index, /detectApplicationPageWhenReady/)
  assert.match(index, /shouldOfferAutofillToast/)
  assert.match(index, /connectedAutofillPrompt/)
  assert.equal(/if \(isJobPlatform\) \{\s*return \{ detected: true/.test(index), false)
  assert.match(notifications, /renderAutofillPrompt\(document\)/)
  assert.match(notifications, /scheduleAutofillPromptRestore/)
  assert.match(notifications, /await autofillPage\(\)/)
  // Login/create-account and Workday Apply Manually install before the toast
  // decision, including on a frame that does not itself offer the prompt.
  const sync = index.slice(index.indexOf('async function syncApplicationPage'))
  const installAt = sync.indexOf('installApplicationHooks(')
  const offerAt = sync.indexOf('shouldOfferAutofillToast')
  assert.ok(installAt >= 0 && offerAt > installAt)
  const icims = readFileSync(new URL('../utils/siteRules/icims.ts', import.meta.url), 'utf8')
  assert.match(icims, /syncIcimsLogin\(personalInfo\)/)
  assert.match(icims, /return watchIcimsLogin\(personalInfo\)/)
  const workday = readFileSync(new URL('../utils/siteRules/workday.ts', import.meta.url), 'utf8')
  assert.match(workday, /applyManually/)
  assert.match(workday, /onMount:/)
})

const HE_JOB = 'https://careers-healthedge.icims.com/jobs/8287/software-engineer---performance-and-tools/job'
const HE_LOGIN = 'https://careers-healthedge.icims.com/jobs/8287/software-engineer---performance-and-tools/login'
const PS_JOB = 'https://careers-powerschool.icims.com/jobs/53014/senior-software-engineer-i/job'
const PS_LOGIN = 'https://careers-powerschool.icims.com/jobs/53014/senior-software-engineer-i/login'
const PE_JOB = 'https://careers-peraton.icims.com/jobs/168754/iam-software-engineer/job'
const PE_LOGIN = 'https://careers-peraton.icims.com/jobs/168754/iam-software-engineer/login'
const ERAC_JOB = 'https://us-erac.icims.com/jobs/555885'

test('Greenhouse department and office filters stay quiet', async () => {
  const html = fixture('greenhouse-board-listing.html')
  const urls = [
    'https://job-boards.greenhouse.io/anthropic?departments=4011495008',
    'https://job-boards.greenhouse.io/anthropic?offices=4003940008',
    'https://boards.greenhouse.io/anthropic?department_id=1&office_id=2',
  ]
  for (const href of urls) {
    const { detection, prompt } = await offer(href, html)
    assert.equal(detection.detected, false, href)
    assert.equal(detection.pending, false, href)
    assert.equal(prompt, null, href)
  }
})

test('a Greenhouse react-select combobox counts toward the application', async () => {
  const href = 'https://job-boards.greenhouse.io/anthropic/jobs/5238460008'
  const html = `<!doctype html><body>
    <form id="application-form" class="application--form">
      <input class="select__input" id="country" type="text" role="combobox" aria-autocomplete="list" />
    </form>
  </body>`
  const dom = new JSDOM(html, { url: href })
  assert.equal(countFillableFields(dom.window.document), 1)
  const { detection, prompt } = await offer(href, html)
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'form')
  assert.ok(prompt)
})

test('a Greenhouse prompt removed by hydration is put back, and a dismissed one is not', () => {
  resetAutofillPromptSession()
  const href = 'https://job-boards.greenhouse.io/anthropic/jobs/5238460008'
  const dom = new JSDOM(fixture('greenhouse-application.html'), { url: href })
  const document = dom.window.document
  const detection = detectApplicationPage({ href, document })
  assert.equal(detection.detected, true)
  assert.ok(detection.fieldCount >= 6)
  renderAutofillPrompt(document)
  const prompt = connectedAutofillPrompt(document)
  assert.ok(prompt)
  document.body.replaceWith(document.createElement('body'))
  assert.equal(prompt.isConnected, false)
  scheduleAutofillPromptRestore(prompt, (fn) => fn())
  assert.equal(prompt.isConnected, true)
  assert.equal(document.querySelectorAll(PROMPT).length, 1)

  const dismissed = new JSDOM('<!doctype html><body></body>', { url: href })
  const closed = renderAutofillPrompt(dismissed.window.document)
  markAutofillPromptClosed()
  closed.remove()
  scheduleAutofillPromptRestore(closed, (fn) => fn())
  assert.equal(closed.isConnected, false)
  resetAutofillPromptSession()
})

test('iCIMS job and login pages toast on the top document only', async () => {
  const cases = [
    { href: HE_JOB, shell: 'icims-job-shell.html', frame: 'icims-job-frame.html' },
    { href: HE_LOGIN, shell: 'icims-login-shell.html', frame: 'icims-login-frame.html' },
    { href: PS_JOB, shell: 'icims-job-shell.html', frame: 'icims-job-frame.html' },
    { href: PS_LOGIN, shell: 'icims-login-shell.html', frame: 'icims-login-frame.html' },
    { href: PE_JOB, shell: 'icims-job-shell.html', frame: 'icims-job-frame.html' },
    { href: PE_LOGIN, shell: 'icims-login-shell.html', frame: 'icims-login-frame.html' },
    { href: ERAC_JOB, shell: 'icims-job-shell.html', frame: 'icims-job-frame.html' },
  ]
  for (const page of cases) {
    const shell = await offer(page.href, fixture(page.shell))
    assert.equal(shell.detection.detected, true, page.href)
    assert.equal(shell.detection.method, 'url_pattern', page.href)
    assert.ok(shell.prompt?.textContent?.includes('Job application detected'), page.href)
    assert.equal(shell.document.querySelectorAll(PROMPT).length, 1, page.href)
    const frameHref = `${page.href}?in_iframe=1`
    const frame = await offer(frameHref, fixture(page.frame), { embedded: true })
    assert.equal(frame.detection.detected, true, frameHref)
    assert.equal(frame.prompt, null, frameHref)
    assert.equal(shouldOfferAutofillToast(frameHref, frame.detection, false), true)
  }
})

test('HealthEdge login shows one toast, from the top document', async () => {
  const shell = await offer(HE_LOGIN, fixture('icims-login-shell.html'))
  const frame = await offer(`${HE_LOGIN}?in_iframe=1`, fixture('icims-login-frame.html'), { embedded: true })
  assert.equal(shell.prompt?.textContent?.includes('Job application detected'), true)
  assert.equal(shell.document.querySelectorAll(PROMPT).length, 1)
  assert.equal(frame.prompt, null)
  assert.ok(frame.detection.fieldCount >= 1)
  assert.ok(frame.detection.fieldCount < 4)
})

test('iCIMS password step and candidate profile toast, and the iframe does not stack a second one', async () => {
  const password = 'https://careers-powerschool.icims.com/jobs/53014/senior-software-engineer-i/login'
  const passwordTop = await offer(password, fixture('icims-password-frame.html'))
  assert.equal(passwordTop.detection.detected, true)
  assert.ok(passwordTop.detection.fieldCount >= 3)
  assert.ok(passwordTop.prompt)
  const passwordFrame = await offer(`${password}?in_iframe=1`, fixture('icims-password-frame.html'), { embedded: true })
  assert.equal(passwordFrame.detection.detected, true)
  assert.equal(passwordFrame.prompt, null)

  const candidate = 'https://careers-peraton.icims.com/jobs/168754/iam-software-engineer/candidate'
  const candidateTop = await offer(candidate, fixture('icims-candidate-frame.html'))
  assert.equal(candidateTop.detection.detected, true)
  assert.ok(candidateTop.detection.fieldCount >= 4)
  assert.ok(candidateTop.prompt)
  const candidateFrame = await offer(`${candidate}?in_iframe=1`, fixture('icims-candidate-frame.html'), { embedded: true })
  assert.equal(candidateFrame.detection.detected, true)
  assert.equal(candidateFrame.prompt, null)

  const shortCandidate = 'https://careers-jobyaviation.icims.com/jobs/5424/candidate?from=login'
  const shortPage = await offer(shortCandidate, fixture('icims-candidate-frame.html'))
  assert.equal(shortPage.detection.detected, true)
  assert.ok(shortPage.prompt)

  const createAccount = 'https://careers-healthedge.icims.com/jobs/8287/software-engineer---performance-and-tools/create-account'
  const accountPage = await offer(createAccount, fixture('icims-password-frame.html'))
  assert.equal(accountPage.detection.detected, true)
  assert.ok(accountPage.prompt)

  const candidateShell = await offer(candidate, fixture('icims-job-shell.html'))
  assert.equal(candidateShell.detection.detected, true)
  assert.ok(candidateShell.prompt)
  const accountShell = await offer(createAccount, fixture('icims-login-shell.html'))
  assert.equal(accountShell.detection.detected, true)
  assert.ok(accountShell.prompt)
})

test('a Jobvite apply shell waits, then toasts once the fields mount', async () => {
  const href = 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply'
  const waiting = await offer(href, fixture('jobvite-apply-shell.html'), { timeoutMs: 2, stepMs: 1 })
  assert.equal(waiting.detection.detected, false)
  assert.equal(waiting.prompt, null)
  const mounted = await offer(href, fixture('jobvite-apply-shell.html'), {
    timeoutMs: 2,
    stepMs: 1,
    afterFirstRead(document) {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<input id="firstName" /><input id="lastName" /><input id="email" type="email" /><input id="phone" type="tel" />',
      )
    },
  })
  assert.equal(mounted.detection.detected, true)
  assert.ok(mounted.prompt)
})

test('an empty Ashby application shell stays pending until the form mounts', async () => {
  const href = 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application'
  const dom = new JSDOM(fixture('ashby-application-shell.html'), { url: href })
  const first = detectApplicationPage({ href, document: dom.window.document })
  assert.equal(first.detected, false)
  assert.equal(first.pending, true)
  const { detection, prompt } = await offer(href, fixture('ashby-application-shell.html'), {
    timeoutMs: 2,
    stepMs: 1,
    afterFirstRead(document) {
      document.body.insertAdjacentHTML('beforeend', fixture('ashby-application.html'))
    },
  })
  assert.equal(detection.detected, true)
  assert.ok(prompt)
})

test('a Workday apply URL prompts before the flow markup is in the document', async () => {
  const href = 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787/apply'
  const { detection, prompt } = await offer(href, '<!doctype html><body><div id="root"></div></body>')
  assert.equal(detection.detected, true)
  assert.equal(detection.method, 'url_pattern')
  assert.ok(prompt)
})

test('a Workday job posting without /apply stays quiet', async () => {
  const href = 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineer_2019787'
  const { detection, prompt } = await offer(href, fixture('workday-search.html'), { timeoutMs: 2, stepMs: 1 })
  assert.equal(detection.detected, false)
  assert.equal(prompt, null)
})

test('a BambooHR job URL prompts even when the form HTML could not be fetched', async () => {
  const href = 'https://acme.bamboohr.com/careers/42'
  const { detection, prompt } = await offer(href, '<!doctype html><body><div id="root"></div></body>')
  assert.equal(detection.detected, true)
  assert.ok(prompt)
})
