import assert from 'node:assert/strict'
import test from 'node:test'
import { captureFieldSnapshot, fieldWasWritten, type WritableField } from './fieldWrite.ts'

function input(partial: Partial<WritableField> & { value: string }): WritableField {
  return {
    type: 'text',
    classList: { contains: () => false },
    getAttribute: () => null,
    closest: () => null,
    parentElement: { textContent: 'unchanged' },
    ...partial,
  }
}

test('a plain input counts only when its value changes', () => {
  const field = input({
    value: '',
    parentElement: { textContent: 'Label 0/500' },
  })
  const snapshot = captureFieldSnapshot(field)
  field.parentElement = { textContent: 'Label 12/500' }
  assert.equal(fieldWasWritten(field, snapshot), false)
  field.value = 'Ada'
  assert.equal(fieldWasWritten(field, snapshot), true)
})

test('a combobox counts when the visible label changes and the input stays empty', () => {
  const field = input({
    value: '',
    getAttribute: (name) => (name === 'role' ? 'combobox' : null),
    parentElement: { textContent: 'Gender' },
  })
  const snapshot = captureFieldSnapshot(field)
  assert.equal(fieldWasWritten(field, snapshot), false)
  field.parentElement = { textContent: 'Gender Male' }
  assert.equal(fieldWasWritten(field, snapshot), true)
})

test('a greenhouse select counts the widget label, not text outside the widget', () => {
  const widget = { textContent: 'School' }
  const field = input({
    value: '',
    closest: (selector) => (selector.includes('.select') ? widget : null),
    parentElement: { textContent: 'whole form' },
  })
  const snapshot = captureFieldSnapshot(field)
  field.parentElement = { textContent: 'whole form changed' }
  assert.equal(fieldWasWritten(field, snapshot), false)
  widget.textContent = 'School State University'
  assert.equal(fieldWasWritten(field, snapshot), true)
})

test('checkbox and file inputs use checked and files, not the parent text', () => {
  const box = input({ type: 'checkbox', value: 'yes', checked: false })
  const boxSnapshot = captureFieldSnapshot(box)
  assert.equal(fieldWasWritten(box, boxSnapshot), false)
  box.checked = true
  assert.equal(fieldWasWritten(box, boxSnapshot), true)

  const file = input({ type: 'file', value: '', files: { length: 0 } })
  const fileSnapshot = captureFieldSnapshot(file)
  assert.equal(fieldWasWritten(file, fileSnapshot), false)
  file.files = { length: 1 }
  assert.equal(fieldWasWritten(file, fileSnapshot), true)
})
