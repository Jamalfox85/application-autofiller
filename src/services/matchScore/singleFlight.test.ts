import assert from 'node:assert/strict'
import test from 'node:test'
import { matchJobIdentity } from './jobUrl.ts'
import { beginSingleFlight, resetSingleFlightForTests } from './singleFlight.ts'

const SALESFORCE =
  'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/California---San-Francisco/Software-Engineering-MTS_JR354592'
const NVIDIA =
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer_JR2020825'
const NVIDIA_ENCODED =
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US%2C-Remote/Software-Engineer_JR2020825'

test('one requisition runs the match-score work once', async () => {
  resetSingleFlightForTests()
  const overview = matchJobIdentity(SALESFORCE)
  const manual = matchJobIdentity(`${SALESFORCE}/apply/applyManually`)
  const plain = matchJobIdentity(NVIDIA)
  const encoded = matchJobIdentity(`${NVIDIA_ENCODED}/apply/applyManually`)
  assert.equal(overview, manual)
  assert.equal(plain, encoded)
  assert.notEqual(overview, plain)

  let salesforceCalls = 0
  let nvidiaCalls = 0
  const salesforce = () =>
    beginSingleFlight(overview, async () => {
      salesforceCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 15))
      return 'salesforce'
    })
  const nvidia = () =>
    beginSingleFlight(plain, async () => {
      nvidiaCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 15))
      return 'nvidia'
    })

  const flights = await Promise.all([salesforce(), salesforce(), nvidia(), nvidia()])
  const results = await Promise.all(flights.map((flight) => flight.result))
  assert.deepEqual(results, ['salesforce', 'salesforce', 'nvidia', 'nvidia'])
  assert.equal(salesforceCalls, 1)
  assert.equal(nvidiaCalls, 1)
  assert.equal(flights.filter((flight) => flight.leader).length, 2)
})
