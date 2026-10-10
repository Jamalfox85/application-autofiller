import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('Welcome upload card opens the tab picker from the toolbar popup and accepts drops', () => {
  const pick = read('./PickPath.vue')
  assert.match(pick, /isToolbarPopup\(\)/)
  assert.match(pick, /openResumeUploadTab\(\)/)
  assert.match(pick, /@drop\.prevent="handleDrop"/)
})

test('the upload tab also accepts a dropped file', () => {
  assert.match(read('../ResumeUploadTab.vue'), /@drop\.prevent="onDrop"/)
})

test('Welcome does not claim profile data stays on the device unless sync is turned on', () => {
  const pick = read('./PickPath.vue')
  assert.doesNotMatch(pick, /stays on this device/)
  assert.doesNotMatch(pick, /turn on sync/)
  assert.match(pick, /saved to your GoFillr account/)
  assert.match(pick, /signed-in devices/)
  const eeo = read('../dialogs/UpdateEEODialog.vue')
  assert.doesNotMatch(eeo, /Stored on your device/)
  assert.match(eeo, /Saved to your GoFillr account/)
  const accounts = read('../dialogs/ApplicationAccountDialog.vue')
  assert.doesNotMatch(accounts, /on this device/)
  assert.match(accounts, /Saved to your GoFillr account/)
})
