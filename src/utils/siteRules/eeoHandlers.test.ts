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

test('EEO dropdowns stay blank when the vault has no value and the field is not required', async () => {
  for (const text of ['gender', 'hispanicethnicityareyouhispanic', 'identifymyraceas', 'veteranstatus', 'disability']) {
    assert.equal(await handlerFor(text)(input, text, blank, ''), 'skip', text)
  }
})

test('EEO stays blank when answers are turned off', async () => {
  const off = { ...blank, eeoAnswersEnabled: false, gender: 'male', raceEthnicity: 'white' }
  for (const text of ['gender', '4033065002raceandethnicity', 'veteranstatus', 'disability']) {
    assert.equal(await handlerFor(text)(input, text, off, ''), 'skip', text)
  }
})

test('a race and ethnicity combobox is the race handler, not an unhandled dropdown', () => {
  const race = reactSelectEeoFieldHandlers.find((h) => h.match(input, '4033065002raceandethnicity'))
  const legacy = reactSelectEeoFieldHandlers.find((h) => h.match(input, 'identifymyraceas'))
  const otherInput = {
    classList: { contains: (token: string) => token === 'select__input' },
  } as unknown as HTMLInputElement
  const other = reactSelectEeoFieldHandlers.find((h) => h.match(otherInput, 'anything'))
  assert.equal(race, legacy)
  assert.notEqual(race, other)
})

test('the hispanic yes/no question stays on its own handler', () => {
  const hispanic = reactSelectEeoFieldHandlers.find((h) => h.match(input, 'hispanicethnicityareyouhispanic'))
  const race = reactSelectEeoFieldHandlers.find((h) => h.match(input, 'identifymyraceas'))
  assert.ok(hispanic)
  assert.notEqual(hispanic, race)
})

test('Are you Hispanic/Latino is the yes/no handler, and identify-your-race is the race handler', () => {
  const hispanicText = 'hispanicethnicityareyouhispanic/latino?offtext'
  const raceText = 'racepleaseidentifyyourraceofftext'
  const hispanic = reactSelectEeoFieldHandlers.find((h) => h.match(input, hispanicText))
  const legacy = reactSelectEeoFieldHandlers.find((h) => h.match(input, 'hispanicethnicityareyouhispanic'))
  const race = reactSelectEeoFieldHandlers.find((h) => h.match(input, raceText))
  assert.equal(hispanic, legacy)
  assert.ok(race)
  assert.notEqual(hispanic, race)
})

test('unhandled react-select dropdowns are owned without counting as filled', async () => {
  const el = { classList: { contains: (c: string) => c === 'select__input' } } as unknown as HTMLInputElement
  const entry = reactSelectEeoFieldHandlers.find((h) => h.match(el, 'anything'))
  assert.equal(await entry!.handle(el, 'anything', blank, ''), 'skip')
})
