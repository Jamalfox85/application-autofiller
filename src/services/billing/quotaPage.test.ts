import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decideQuotaClaim,
  forgetQuotaClaim,
  planFillCharge,
  quotaPageKey,
  rememberSubmittedApplication,
  sameClickQuotaClaim,
} from './quotaPage.ts'

const page = 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123'

test('quota page key ignores the hash and keeps the job query', () => {
  assert.equal(quotaPageKey(`${page}#step-2`), page)
  assert.equal(quotaPageKey('https://boards.greenhouse.io/other/jobs/9'), 'https://boards.greenhouse.io/other/jobs/9')
  assert.equal(quotaPageKey('chrome://extensions'), '')
  assert.equal(quotaPageKey(''), '')
})

test('the same page is claimed once per week, including a second frame', () => {
  const first = decideQuotaClaim({}, page, '2026-W41')
  assert.equal(first.claimed, true)
  const second = decideQuotaClaim(first.claims, page, '2026-W41')
  assert.equal(second.claimed, false)
  assert.equal(second.claims[page], '2026-W41')
})

test('a first fill is counted and a later fill of that application is not', () => {
  const started = 1_700_000_000_000
  const first = planFillCharge({
    filledCount: 4,
    sameFrameInFlight: false,
    sameFrameAlreadyCounted: false,
    claim: 'granted',
    fillStartedAt: started,
  })
  assert.equal(first.increment, true)
  assert.equal(first.repeatFill, false)

  const repeat = planFillCharge({
    filledCount: 4,
    sameFrameInFlight: false,
    sameFrameAlreadyCounted: true,
    claim: 'already_counted',
    claimedAt: started - 60_000,
    fillStartedAt: started,
  })
  assert.equal(repeat.increment, false)
  assert.equal(repeat.repeatFill, true)

  const nextStep = planFillCharge({
    filledCount: 2,
    sameFrameInFlight: false,
    sameFrameAlreadyCounted: false,
    claim: 'already_counted',
    claimedAt: started - 60_000,
    fillStartedAt: started,
  })
  assert.equal(nextStep.increment, false)
  assert.equal(nextStep.repeatFill, true)
})

test('a sibling frame that claims during this click is not labeled already counted', () => {
  const started = 1_700_000_000_000
  assert.equal(sameClickQuotaClaim(started + 12_000, started), true)
  assert.equal(sameClickQuotaClaim(started - 60_000, started), false)
  assert.equal(sameClickQuotaClaim(0, started), false)

  const sibling = planFillCharge({
    filledCount: 20,
    sameFrameInFlight: false,
    sameFrameAlreadyCounted: false,
    claim: 'already_counted',
    claimedAt: started + 12_000,
    fillStartedAt: started,
  })
  assert.equal(sibling.increment, false)
  assert.equal(sibling.repeatFill, false)

  const topUp = planFillCharge({
    filledCount: 3,
    sameFrameInFlight: true,
    sameFrameAlreadyCounted: false,
    claim: 'granted',
    fillStartedAt: started,
  })
  assert.equal(topUp.increment, false)
  assert.equal(topUp.repeatFill, false)
})

test('the service worker serializes the claim and the build emits it', () => {
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  assert.equal(background.includes("request.action === 'claimFillQuota'"), true)
  assert.equal(background.includes('claimedAt'), true)
  assert.equal(background.includes('fillQuotaClaimedAt'), true)
  assert.equal(background.includes('enqueueQuotaClaim'), true)
  assert.equal(background.includes('./src/services/billing/quotaPage.js'), true)
  assert.equal(emit.includes('src/services/billing/quotaPage.ts'), true)
  assert.equal(background.includes("request.action === 'claimApplicationSubmitted'"), true)
  assert.equal(background.includes('rememberSubmittedApplication'), true)
  assert.equal(background.includes('enqueueSubmissionClaim'), true)
})

test('an application is submitted once, including its confirmation key', () => {
  const job = 'https://nvidia.wd5.myworkdayjobs.com/en-US/site/job/City/Role_JR1'
  const first = rememberSubmittedApplication([], [job])
  assert.equal(first.first, true)
  assert.equal(rememberSubmittedApplication(first.keys, [job, `${job}/confirmation`]).first, false)
  const other = rememberSubmittedApplication(first.keys, [`${job.replace('JR1', 'JR2')}`])
  assert.equal(other.first, true)
})

test('multi-step applications claim once, including a navigation to the next step', () => {
  const workday =
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineer_JR1234567'
  const workdayApply = `${workday}/apply`
  const workdayManual = `${workday}/apply/applyManually`
  const workdayResume = `${workday}/apply/autofillWithResume?source=LinkedIn`
  const workdayHash = `${workdayApply}#step-experience`
  assert.equal(quotaPageKey(workdayApply), workday)
  assert.equal(quotaPageKey(workdayManual), quotaPageKey(workdayApply))
  assert.equal(quotaPageKey(workdayResume), quotaPageKey(workdayApply))
  assert.equal(quotaPageKey(workdayHash), quotaPageKey(workdayApply))
  const otherWorkday =
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Designer_JR999/apply'
  assert.notEqual(quotaPageKey(otherWorkday), quotaPageKey(workdayApply))

  const first = decideQuotaClaim({}, quotaPageKey(workdayApply), '2026-W41')
  assert.equal(first.claimed, true)
  const nextStep = decideQuotaClaim(first.claims, quotaPageKey(workdayManual), '2026-W41')
  assert.equal(nextStep.claimed, false)
  const other = decideQuotaClaim(nextStep.claims, quotaPageKey(otherWorkday), '2026-W41')
  assert.equal(other.claimed, true)

  const icimsLogin = 'https://careers-kemin.icims.com/jobs/5424/autonomy-embedded-engineer/login'
  const icimsFrame =
    'https://careers-kemin.icims.com/jobs/5424/autonomy-embedded-engineer/candidate?in_iframe=1&eem=abc123'
  const icimsOther = 'https://careers-kemin.icims.com/jobs/13000/other-role/candidate'
  assert.equal(quotaPageKey(icimsLogin), 'https://careers-kemin.icims.com/jobs/5424')
  assert.equal(quotaPageKey(icimsFrame), quotaPageKey(icimsLogin))
  assert.notEqual(quotaPageKey(icimsOther), quotaPageKey(icimsLogin))

  const lever = 'https://jobs.lever.co/wealthfront/78d6f6d5-1f08-4d5d-87be-c4250567bfb5'
  assert.equal(quotaPageKey(`${lever}/apply`), lever)
  assert.equal(quotaPageKey(`${lever}/thanks`), lever)
  assert.notEqual(quotaPageKey('https://jobs.lever.co/wealthfront/00000000-0000-0000-0000-000000000001/apply'), lever)

  const ashby = 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2'
  assert.equal(quotaPageKey(`${ashby}/application?embed=js`), ashby)

  const workable = 'https://apply.workable.com/acely/j/876996D5A3'
  assert.equal(quotaPageKey(`${workable}/apply/`), workable)
  assert.equal(quotaPageKey(`${workable}/apply/?step=eeo`), workable)

  const bamboo = 'https://acme.bamboohr.com/careers/123'
  assert.equal(quotaPageKey(`${bamboo}/apply`), bamboo)
  assert.notEqual(quotaPageKey('https://acme.bamboohr.com/careers/456/apply'), bamboo)

  const jobvite = 'https://jobs.jobvite.com/uplight/job/oPTRAfwT'
  assert.equal(quotaPageKey(`${jobvite}/apply`), jobvite)
  assert.equal(quotaPageKey('https://jobs.jobvite.com/careers/kymanox/job/abc123/apply'), 'https://jobs.jobvite.com/careers/kymanox/job/abc123')

  const generic = 'https://careers.example.com/jobs/44'
  assert.equal(quotaPageKey(`${generic}/apply?step=2`), generic)
  assert.equal(quotaPageKey(`${generic}/apply?step=3&page=1`), generic)
  assert.equal(quotaPageKey(`${generic}/apply#step-2`), generic)
  assert.equal(quotaPageKey(`${generic}/apply?req=abc&step=2`), `${generic}?req=abc`)
  assert.notEqual(quotaPageKey('https://careers.example.com/jobs/45/apply'), generic)

  assert.equal(
    quotaPageKey('https://boards.greenhouse.io/acme/jobs/123/confirmation?gh_jid=123'),
    page,
  )
  assert.equal(
    quotaPageKey('https://www.carvana.com/careers/apply?gh_jid=8220620&gh_src=linkedin'),
    quotaPageKey('https://www.carvana.com/careers/apply?gh_jid=8220620'),
  )
  assert.notEqual(
    quotaPageKey('https://www.carvana.com/careers/apply?gh_jid=8220620'),
    quotaPageKey('https://www.carvana.com/careers/apply?gh_jid=1'),
  )

  const taleo = 'https://acme.taleo.net/careersection/ex/jobapply.ftl?job=22001&lang=en'
  const taleoNext = 'https://acme.taleo.net/careersection/ex/jobapply.ftl?job=22001&ftlcompid=999'
  assert.equal(quotaPageKey(taleo), quotaPageKey(taleoNext))
  assert.notEqual(quotaPageKey(taleo), quotaPageKey('https://acme.taleo.net/careersection/ex/jobapply.ftl?job=22002'))
})

test('a new week can charge the same page again, and a failed commit releases it', () => {
  const first = decideQuotaClaim({ [page]: '2026-W40', 'https://old.example/job': '2026-W40' }, page, '2026-W41')
  assert.equal(first.claimed, true)
  assert.equal(first.claims['https://old.example/job'], undefined)
  const released = forgetQuotaClaim(first.claims, page)
  assert.equal(released[page], undefined)
  assert.equal(decideQuotaClaim(released, page, '2026-W41').claimed, true)
})
