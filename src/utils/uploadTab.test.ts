import assert from 'node:assert/strict'
import test from 'node:test'
import { isResumeUploadTab, isToolbarPopup, openResumeUploadTab } from './uploadTab.ts'

test('popup vs upload tab detection', () => {
  assert.equal(isToolbarPopup({ search: '' }), true)
  assert.equal(isToolbarPopup({ search: '?tab=1&upload=resume' }), false)
  assert.equal(isResumeUploadTab({ search: '?tab=1&upload=resume' }), true)
  assert.equal(isResumeUploadTab({ search: '?upload=resume' }), false)
})

test('openResumeUploadTab opens the tab then closes the popup', async () => {
  const calls: string[] = []
  const ok = await openResumeUploadTab({
    getURL: (p) => `chrome-extension://id/${p}`,
    createTab: async (u) => void calls.push(u),
    closeSelf: () => void calls.push('close'),
  })
  assert.equal(ok, true)
  assert.deepEqual(calls, ['chrome-extension://id/popup.html?tab=1&upload=resume', 'close'])
})

test('if the tab cannot be opened the popup stays and falls back to the inline picker', async () => {
  let closed = false
  const ok = await openResumeUploadTab({
    getURL: (p) => p,
    createTab: async () => {
      throw new Error('no')
    },
    closeSelf: () => {
      closed = true
    },
  })
  assert.equal(ok, false)
  assert.equal(closed, false)
})
