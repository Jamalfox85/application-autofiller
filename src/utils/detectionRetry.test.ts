import assert from 'node:assert/strict'
import test from 'node:test'
import { detectWithRetry, waitForFieldCount, type Detection } from './detectionRetry.ts'

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
