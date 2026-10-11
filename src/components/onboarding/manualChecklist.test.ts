import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  SHEET_LEAVE_MS,
  nextChecklistTarget,
  sheetToOpenAfterSave,
  type ChecklistSection,
} from './manualChecklist.ts'

const sections: ChecklistSection[] = [
  { key: 'personal', required: true },
  { key: 'experience', required: true },
  { key: 'education', required: false },
  { key: 'links', required: false },
  { key: 'authorization', required: false },
  { key: 'demographics', required: false },
  { key: 'skills', required: false },
]

test('Continue opens the first incomplete required section and skips empty optionals', () => {
  const done = new Set(['personal'])
  const next = nextChecklistTarget(sections, (section) => done.has(section.key), null)
  assert.equal(next?.key, 'experience')

  done.add('experience')
  assert.equal(nextChecklistTarget(sections, (section) => done.has(section.key), null), null)
})

test('saving an empty optional section does not open another sheet', () => {
  const done = new Set(['personal', 'experience'])
  assert.equal(
    sheetToOpenAfterSave(sections, (section) => done.has(section.key), 'education'),
    null,
  )
  assert.equal(
    sheetToOpenAfterSave(sections, (section) => done.has(section.key), 'skills'),
    null,
  )
})

test('saving a required section opens the next required one, after the sheet has left', () => {
  const done = new Set(['personal'])
  assert.equal(
    sheetToOpenAfterSave(sections, (section) => done.has(section.key), 'personal')?.key,
    'experience',
  )
  assert.ok(SHEET_LEAVE_MS >= 200)
})

test('the checklist mounts the skills editor and waits out the sheet leave', () => {
  const checklist = readFileSync(new URL('./ManualEntryChecklist.vue', import.meta.url), 'utf8')
  assert.match(checklist, /skills: UpdateSkillsDialog/)
  assert.match(checklist, /sheetToOpenAfterSave/)
  assert.match(checklist, /SHEET_LEAVE_MS/)
  assert.match(checklist, /nextChecklistTarget/)
  assert.match(checklist, /emit\('finishLater'\)/)
})
