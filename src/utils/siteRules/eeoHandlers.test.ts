import assert from 'node:assert/strict'
import test from 'node:test'
import { reactSelectEeoFieldHandlers } from './eeoHandlers.ts'

const input = {} as HTMLInputElement
const blank = { eeoAnswersEnabled: true, gender: '', raceEthnicity: '', veteranStatus: '', disabilityStatus: '' } as never

function handlerFor(text: string) {
  const entry = reactSelectEeoFieldHandlers.find((h) => h.match(input, text))
  assert.ok(entry, text)
  return entry.handle
}

test('EEO dropdowns are skipped, not set, when the vault has no value', async () => {
  for (const text of ['gender', 'hispanicethnicityareyouhispanic', 'identifymyraceas', 'veteranstatus', 'disability']) {
    assert.equal(await handlerFor(text)(input, text, blank, ''), 'skip', text)
  }
})

test('unhandled react-select dropdowns are owned without counting as filled', async () => {
  const el = { classList: { contains: (c: string) => c === 'select__input' } } as unknown as HTMLInputElement
  const entry = reactSelectEeoFieldHandlers.find((h) => h.match(el, 'anything'))
  assert.equal(await entry!.handle(el, 'anything', blank, ''), 'skip')
})
