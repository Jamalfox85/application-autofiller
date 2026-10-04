import assert from 'node:assert/strict'
import test from 'node:test'
import { isBambooCountryControl, pickBambooCountryOption } from './bamboohrFields.ts'

const COUNTRIES = [
  'United States',
  'Canada',
  'Norway',
  'United Arab Emirates',
  'United Kingdom',
  'US Minor Outlying Islands',
]

test('chooses United States when Norway is also listed and is the current value', () => {
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', 'united_states'), 'United States')
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', 'United States'), 'United States')
  assert.equal(pickBambooCountryOption(COUNTRIES, '161', 'united_states'), 'United States')
})

test('a blank profile country does not replace the posting default', () => {
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', ''), null)
  assert.equal(pickBambooCountryOption(COUNTRIES, 'United States', '   '), null)
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', null), null)
})

test('does not choose a nearby United option when United States is absent', () => {
  const withoutUs = COUNTRIES.filter((country) => country !== 'United States')
  assert.equal(pickBambooCountryOption(withoutUs, 'Norway', 'united_states'), null)
})

test('only the countryId select is the country control', () => {
  assert.equal(
    isBambooCountryControl({ name: 'countryId.value', id: 'fab-select346', type: 'select-one' }),
    true,
  )
  assert.equal(
    isBambooCountryControl({ name: 'state.value', id: 'fab-select345', type: 'select-one' }),
    false,
  )
  assert.equal(
    isBambooCountryControl({ name: 'state.value', id: 'FabricTextField-344', type: 'text' }),
    false,
  )
  assert.equal(
    isBambooCountryControl({
      name: 'educationInstitutionName',
      id: 'educationInstitutionName',
      type: 'text',
    }),
    false,
  )
})
