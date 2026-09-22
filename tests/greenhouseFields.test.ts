import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dialingCodeSearchValues,
  isGreenhousePhoneDialingCodeField,
  locationSearchQueries,
  phoneDialingCodeTarget,
  pickDialingCodeOption,
  pickLocationOption,
} from '../src/utils/siteRules/greenhouseFields.ts'

const usProfile = {
  city: 'San Francisco',
  state: 'California',
  country: 'united_states',
  phoneCountryCode: '+1',
}

describe('phone dialing-code mapping', () => {
  it('maps +1 and united_states to United States +1', () => {
    const target = phoneDialingCodeTarget(usProfile)
    assert.deepEqual(target, { label: 'United States', dialCode: '+1' })
    assert.deepEqual(dialingCodeSearchValues(target!), ['United States', 'United States +1'])
  })

  it('maps a bare +1 to United States when residence country is empty', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+1', country: '' }), {
      label: 'United States',
      dialCode: '+1',
    })
  })

  it('uses Canada when +1 belongs to a Canadian residence', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+1', country: 'canada' }), {
      label: 'Canada',
      dialCode: '+1',
    })
  })

  it('maps +44 and united_kingdom to the United Kingdom', () => {
    assert.deepEqual(phoneDialingCodeTarget({ phoneCountryCode: '+44', country: 'united_states' }), {
      label: 'United Kingdom',
      dialCode: '+44',
    })
    assert.deepEqual(phoneDialingCodeTarget({ country: 'united_kingdom' }), {
      label: 'United Kingdom',
      dialCode: '+44',
    })
  })

  it('maps a residence country when no calling code is stored', () => {
    assert.deepEqual(phoneDialingCodeTarget({ country: 'united_states', phoneCountryCode: '' }), {
      label: 'United States',
      dialCode: '+1',
    })
  })

  it('does not invent a dialing code when neither phone code nor country is set', () => {
    assert.equal(phoneDialingCodeTarget({ country: '', phoneCountryCode: '' }), null)
  })

  it('picks the United States +1 option, not another +1 country', () => {
    const target = phoneDialingCodeTarget(usProfile)!
    const picked = pickDialingCodeOption(
      [
        'American Samoa +1',
        'Canada +1',
        'United States +1',
        'United States Minor Outlying Islands +1',
        'Bahamas +1242',
      ],
      target,
    )
    assert.equal(picked, 'United States +1')
  })

  it('leaves #country empty rather than selecting a near-name +1 territory', () => {
    const target = phoneDialingCodeTarget(usProfile)!
    assert.equal(
      pickDialingCodeOption(['United States Minor Outlying Islands +1', 'Canada +1'], target),
      null,
    )
  })

  it('treats only id=country as the dialing-code field', () => {
    assert.equal(isGreenhousePhoneDialingCodeField('country'), true)
    assert.equal(isGreenhousePhoneDialingCodeField('question_36622861002'), false)
    assert.equal(isGreenhousePhoneDialingCodeField('candidate-location'), false)
    assert.equal(isGreenhousePhoneDialingCodeField(null), false)
  })
})

describe('location option preference', () => {
  it('searches City, State and does not send the country slug to the geocoder', () => {
    const queries = locationSearchQueries(usProfile)
    assert.deepEqual(queries, ['San Francisco, California', 'San Francisco'])
    assert.equal(queries.some((query) => /united[_ ]states/i.test(query)), false)
  })

  it('uses the state label instead of a snake_case profile value', () => {
    assert.deepEqual(
      locationSearchQueries({ city: 'Albany', state: 'New_York', country: 'united_states' }),
      ['Albany, New York', 'Albany'],
    )
    assert.deepEqual(
      locationSearchQueries({
        city: 'Belfast',
        state: 'Northern_Ireland',
        country: 'united_kingdom',
      }),
      ['Belfast, Northern Ireland', 'Belfast'],
    )
  })

  it('prefers the US San Francisco hit over Cebu and South San Francisco', () => {
    const picked = pickLocationOption(
      [
        'San Francisco, Cebu, Philippines',
        'San Francisco, Agusan del Sur, Philippines',
        'South San Francisco, California, United States',
        'San Francisco, California, United States',
        'San Francisco, Baja California Sur, Mexico',
      ],
      usProfile,
    )
    assert.equal(picked, 'San Francisco, California, United States')
  })

  it('does not accept a wrong-country hit when that is the only option', () => {
    assert.equal(
      pickLocationOption(['San Francisco, Cebu, Philippines'], usProfile),
      null,
    )
    assert.equal(
      pickLocationOption(['San Francisco, Philippines'], usProfile),
      null,
    )
  })

  it('accepts a USA abbreviation and still rejects the Philippines result listed first', () => {
    const picked = pickLocationOption(
      ['San Francisco, Cebu, Philippines', 'San Francisco, CA, USA'],
      usProfile,
    )
    assert.equal(picked, 'San Francisco, CA, USA')
  })
})
