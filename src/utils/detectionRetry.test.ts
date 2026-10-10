import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectFrameDetections,
  detectWithRetry,
  preferDetection,
  waitForFieldCount,
  FIELD_WAIT_MS,
  type Detection,
} from './detectionRetry.ts'

const found: Detection = { detected: true, siteLabel: 'Greenhouse', fieldCount: 45 }
const none: Detection = { detected: false, siteLabel: null, fieldCount: 0 }
const wait = async () => {}

test('retries after an empty first answer and returns the later detection', async () => {
  const answers = [none, none, found]
  const result = await detectWithRetry({ ask: async () => answers.shift(), inject: async () => {}, wait })
  assert.equal(result.fieldCount, 45)
})

test('injects the content script once when no frame answers, then succeeds', async () => {
  let injected = 0
  let ready = false
  const result = await detectWithRetry({
    ask: async () => {
      if (!ready) throw new Error('Receiving end does not exist')
      return found
    },
    inject: async () => {
      injected++
      ready = true
    },
    wait,
  })
  assert.equal(injected, 1)
  assert.equal(result.detected, true)
})

test('gives up with not-detected after the attempts are used', async () => {
  let asks = 0
  const result = await detectWithRetry({ ask: async () => (asks++, none), inject: async () => {}, wait }, { attempts: 3 })
  assert.equal(asks, 3)
  assert.equal(result.detected, false)
})

test('waitForFieldCount polls until fields render', async () => {
  let n = 0
  const count = () => (n >= 3 ? 45 : 0)
  const result = await waitForFieldCount(count, async () => { n++ })
  assert.equal(result, 45)
})

test('preferDetection keeps the frame with the form, not the first empty shell', () => {
  const shell: Detection = { detected: true, siteLabel: 'jobs.example.com', fieldCount: 2 }
  assert.equal(preferDetection([none, shell, found]).fieldCount, 45)
  assert.equal(preferDetection([none, undefined]).detected, false)
  assert.equal(FIELD_WAIT_MS >= 4000, true)
})

test('collectFrameDetections waits for a slow frame instead of taking the first answer', async () => {
  const shell: Detection = { detected: true, siteLabel: 'jobs.example.com', fieldCount: 2 }
  let slowAnswered = false
  const result = await collectFrameDetections([0, 1], async (frameId) => {
    if (frameId === 0) return shell
    await Promise.resolve()
    slowAnswered = true
    return found
  })
  assert.equal(slowAnswered, true)
  assert.equal(result.siteLabel, 'Greenhouse')
  assert.equal(result.fieldCount, 45)
})

test('collectFrameDetections rejects when no frame has a content script', async () => {
  await assert.rejects(
    collectFrameDetections([0, 1], async () => {
      throw new Error('Receiving end does not exist')
    }),
    /Receiving end does not exist/,
  )
})

test('an empty answer beside a silent frame still rejects so the embed can be injected', async () => {
  await assert.rejects(
    collectFrameDetections([0, 1], async (frameId) => {
      if (frameId === 0) return none
      throw new Error('Receiving end does not exist')
    }),
    /Receiving end does not exist/,
  )
})

test('a silent frame does not discard a form another frame already found', async () => {
  const result = await collectFrameDetections([0, 1], async (frameId) => {
    if (frameId === 1) throw new Error('Receiving end does not exist')
    return found
  })
  assert.equal(result.fieldCount, 45)
})
