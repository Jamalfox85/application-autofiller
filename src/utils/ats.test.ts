import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atsFromHostname,
  detectAts,
  documentHasGreenhouseMarkers,
  documentHasWorkableForm,
  documentHasWorkableMarkers,
  hrefHasGreenhouseJobId,
  isWorkableApplyHost,
} from './ats.ts'
import { getSiteLabel } from './jobSitePatterns.ts'

test('maps Greenhouse job-board hosts', () => {
  assert.equal(atsFromHostname('job-boards.greenhouse.io'), 'greenhouse')
  assert.equal(atsFromHostname('boards.greenhouse.io'), 'greenhouse')
})

test('maps other known ATS hosts and ignores everyone else', () => {
  assert.equal(atsFromHostname('jobs.lever.co'), 'lever')
  assert.equal(atsFromHostname('jobs.eu.lever.co'), 'lever')
  assert.equal(atsFromHostname('company.wd5.myworkdayjobs.com'), 'workday')
  assert.equal(atsFromHostname('acme.wd1.myworkday.com'), 'workday')
  assert.equal(atsFromHostname('acme.wd3.myworkdaysite.com'), 'workday')
  assert.equal(atsFromHostname('www.workday.com'), 'workday')
  assert.equal(atsFromHostname('jobs.ashbyhq.com'), 'ashby')
  assert.equal(atsFromHostname('careers.example.com'), null)
  assert.equal(atsFromHostname('jobs.smartrecruiters.com'), null)
  assert.equal(atsFromHostname('recruiting2.ultipro.com'), null)
  assert.equal(atsFromHostname('acme.breezy.hr'), null)
  assert.equal(atsFromHostname('acme.recruitee.com'), null)
  assert.equal(atsFromHostname('acme.jazz.co'), null)
  assert.equal(atsFromHostname('acme.applytojob.com'), null)
})

test('removed ATS hosts are not treated as known job platforms', () => {
  assert.equal(getSiteLabel('jobs.smartrecruiters.com'), 'jobs.smartrecruiters.com')
  assert.equal(getSiteLabel('recruiting2.ultipro.com'), 'recruiting2.ultipro.com')
  assert.equal(getSiteLabel('acme.breezy.hr'), 'acme.breezy.hr')
  assert.equal(getSiteLabel('acme.recruitee.com'), 'acme.recruitee.com')
  assert.equal(getSiteLabel('acme.jazz.co'), 'acme.jazz.co')
  assert.equal(getSiteLabel('acme.applytojob.com'), 'acme.applytojob.com')
  assert.equal(getSiteLabel('jobs.lever.co'), 'Lever')
  assert.equal(getSiteLabel('boards.greenhouse.io'), 'Greenhouse')
  assert.equal(getSiteLabel('jobs.jobvite.com'), 'Jobvite')
  assert.equal(getSiteLabel('apply.workable.com'), 'Workable')
})

test('hosted Lever stays lever even when the form id matches Greenhouse and gh_jid is present', () => {
  const doc = {
    getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
    querySelector: () => null,
  }
  assert.equal(
    detectAts({
      hostname: 'jobs.lever.co',
      href: 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5/apply?gh_jid=1',
      document: doc,
    }),
    'lever',
  )
  assert.equal(
    detectAts({
      hostname: 'jobs.ashbyhq.com',
      href: 'https://jobs.ashbyhq.com/ashby/example/application',
      document: doc,
    }),
    'ashby',
  )
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
    detectAts({
      hostname: 'boards.greenhouse.io',
      href: 'https://boards.greenhouse.io/acme/jobs/1',
    }),
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

test('hosted Jobvite career and apply hosts tag ats=jobvite', () => {
  assert.equal(atsFromHostname('jobs.jobvite.com'), 'jobvite')
  assert.equal(atsFromHostname('Jobs.Jobvite.com'), 'jobvite')
  assert.equal(atsFromHostname('acme.jobvite.com'), 'jobvite')
  assert.equal(
    detectAts({
      hostname: 'jobs.jobvite.com',
      href: 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply',
    }),
    'jobvite',
  )
  assert.equal(
    detectAts({
      hostname: 'jobs.jobvite.com',
      href: 'https://jobs.jobvite.com/careers/kymanox/job/abc123/apply',
    }),
    'jobvite',
  )
  assert.equal(atsFromHostname('jobs.lever.co'), 'lever')
})

test('hosted Ashby job boards tag ats=ashby', () => {
  assert.equal(
    detectAts({
      hostname: 'jobs.ashbyhq.com',
      href: 'https://jobs.ashbyhq.com/notion/1fc309c8-da20-4ff2-84c7-8b863ece2b0a/application',
    }),
    'ashby',
  )
  assert.equal(atsFromHostname('acme.ashbyhq.com'), 'ashby')
})

test('Ashby form markup on a custom domain stays untagged', () => {
  const doc = {
    getElementById: () => null,
    querySelector: (selector: string) =>
      selector === '.ashby-application-form-container' ? ({} as Element) : null,
  }
  assert.equal(
    detectAts({
      hostname: 'careers.example.com',
      href: 'https://careers.example.com/jobs/designer',
      document: doc,
    }),
    null,
  )
})

test('Greenhouse DOM markers still win over an unrelated host', () => {
  const doc = {
    getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
    querySelector: () => null,
  }
  assert.equal(
    detectAts({
      hostname: 'www.carvana.com',
      href: 'https://www.carvana.com/careers/apply',
      document: doc,
    }),
    'greenhouse',
  )
})

test('hosted Workable apply is workable and the marketing site is not', () => {
  assert.equal(atsFromHostname('apply.workable.com'), 'workable')
  assert.equal(atsFromHostname('Apply.Workable.com'), 'workable')
  assert.equal(isWorkableApplyHost('jobs.apply.workable.com'), true)
  assert.equal(atsFromHostname('www.workable.com'), null)
  assert.equal(atsFromHostname('workable.com'), null)
  assert.equal(atsFromHostname('help.workable.com'), null)
  assert.equal(atsFromHostname('resources.workable.com'), null)
  assert.equal(
    detectAts({
      hostname: 'apply.workable.com',
      href: 'https://apply.workable.com/acely/j/876996D5A3/apply/',
    }),
    'workable',
  )
})

test('embedded Workable apply is workable and a job-list widget is not', () => {
  const meta = { getAttribute: (name: string) => (name === 'content' ? 'workable.com' : null) }
  const form = {}
  const iframe = {}
  const customDomain = {
    getElementById: () => null,
    querySelector: (selector: string) => {
      if (selector === 'meta[name="domain"]') return meta
      if (selector === '[data-ui="application-form"]') return form
      return null
    },
  }
  assert.equal(documentHasWorkableForm(customDomain), true)
  assert.equal(
    detectAts({
      hostname: 'careers.acme.com',
      href: 'https://careers.acme.com/j/abc/apply',
      document: customDomain,
    }),
    'workable',
  )

  const embed = {
    getElementById: () => null,
    querySelector: (selector: string) =>
      selector === 'iframe[src*="apply.workable.com"]' ? iframe : null,
  }
  assert.equal(documentHasWorkableMarkers(embed), true)
  assert.equal(
    detectAts({
      hostname: 'www.acme.com',
      href: 'https://www.acme.com/careers',
      document: embed,
    }),
    'workable',
  )

  const listing = {
    getElementById: () => null,
    querySelector: (selector: string) => (selector === '#whr_embed_hook' ? {} : null),
  }
  assert.equal(
    detectAts({
      hostname: 'www.acme.com',
      href: 'https://www.acme.com/careers',
      document: listing,
    }),
    null,
  )
})

test('a Greenhouse apply form keeps its tag when a Workable iframe is also present', () => {
  const doc = {
    getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
    querySelector: (selector: string) =>
      selector === 'iframe[src*="apply.workable.com"]' ? ({} as Element) : null,
  }
  assert.equal(
    detectAts({
      hostname: 'www.carvana.com',
      href: 'https://www.carvana.com/careers/apply',
      document: doc,
    }),
    'greenhouse',
  )
})

test('Greenhouse DOM markers detect embeds without gh_jid', () => {
  const doc = {
    getElementById: (id: string) => (id === 'application-form' ? ({} as HTMLElement) : null),
    querySelector: () => null,
  }
  assert.equal(documentHasGreenhouseMarkers(doc), true)
  assert.equal(
    detectAts({
      hostname: 'www.carvana.com',
      href: 'https://www.carvana.com/careers/apply',
      document: doc,
    }),
    'greenhouse',
  )
})
