import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverToTopFrame } from './relay.ts'

test('a job frame retries the card until the top frame is listening', async () => {
  let calls = 0
  const waits: number[] = []
  const delivered = await deliverToTopFrame(
    async () => {
      calls += 1
      if (calls < 3) throw new Error('Receiving end does not exist.')
    },
    async (ms) => {
      waits.push(ms)
    },
    40,
    100,
  )
  assert.equal(delivered, true)
  assert.equal(calls, 3)
  assert.deepEqual(waits, [100, 100])
})

test('a top frame that never listens gives up without throwing', async () => {
  let calls = 0
  const delivered = await deliverToTopFrame(
    async () => {
      calls += 1
      throw new Error('Receiving end does not exist.')
    },
    async () => {},
    3,
    100,
  )
  assert.equal(delivered, false)
  assert.equal(calls, 3)
})
