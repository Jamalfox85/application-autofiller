import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalMatchJobUrl, matchJobIdentity, sameMatchJob, workdayJobKey } from './jobUrl.ts'

const NVIDIA =
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Software-Engineer--OpenShell_JR2020825'
const SALESFORCE =
  'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/California---San-Francisco/Software-Engineering-MTS_JR354592'
const CISCO =
  'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Austin-Texas-US/Senior-Hardware-Engineering-Program-Manager_2028178-1'

test('Workday overview, apply, and applyManually share one requisition', () => {
  const apply = `${CISCO}/apply`
  const manual = `${CISCO}/apply/applyManually?source=job#form`
  assert.equal(workdayJobKey(CISCO), workdayJobKey(apply))
  assert.equal(workdayJobKey(CISCO), workdayJobKey(manual))
  assert.equal(matchJobIdentity(manual), workdayJobKey(CISCO))
  assert.equal(canonicalMatchJobUrl(apply), CISCO)
  assert.equal(canonicalMatchJobUrl(manual), CISCO)
  assert.equal(sameMatchJob(CISCO, manual), true)
  assert.equal(
    workdayJobKey(CISCO),
    'cisco.wd5.myworkdayjobs.com|cisco_careers|2028178-1',
  )
})

test('different Workday requisitions stay distinct', () => {
  assert.notEqual(workdayJobKey(NVIDIA), workdayJobKey(SALESFORCE))
  assert.equal(sameMatchJob(NVIDIA, SALESFORCE), false)
  assert.equal(canonicalMatchJobUrl(NVIDIA), NVIDIA)
  assert.equal(
    workdayJobKey(`${SALESFORCE}/apply/applyManually`),
    'salesforce.wd12.myworkdayjobs.com|external_career_site|jr354592',
  )
})

test('other hosts are not folded together', () => {
  const left = 'https://job-boards.greenhouse.io/gitlab/jobs/1'
  const right = 'https://job-boards.greenhouse.io/gitlab/jobs/2'
  assert.equal(workdayJobKey(left), null)
  assert.equal(canonicalMatchJobUrl(left), left)
  assert.equal(matchJobIdentity(left), left)
  assert.equal(sameMatchJob(left, right), false)
  assert.equal(sameMatchJob(left, left), true)
})
