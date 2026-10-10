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
