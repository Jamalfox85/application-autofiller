import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countrySearchValues,
  degreeSearchValues,
  disciplineSearchValues,
  isResidenceCountryField,
  isStateQuestion,
  locationSearchValues,
  monthNameFromLooseDate,
  schoolSearchValues,
  stateSearchValues,
  yearFromLooseDate,
} from './greenhouseValues.ts'

test('country search uses the Greenhouse label for stored snake_case keys', () => {
  assert.deepEqual(countrySearchValues('united_states'), ['United States'])
  assert.deepEqual(countrySearchValues('united_kingdom'), ['United Kingdom'])
  assert.deepEqual(countrySearchValues(''), [])
})

test('state search turns New_York into New York', () => {
  assert.deepEqual(stateSearchValues('New_York'), ['New York'])
})

test('location search leads with city and state, the geocoder-friendly query', () => {
  assert.deepEqual(
    locationSearchValues({
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
    }),
    [
      'San Francisco, California',
      'San Francisco, California, United States',
      'San Francisco',
      'California, United States',
    ],
  )
  assert.deepEqual(locationSearchValues({ country: 'United States' }), [])
})

test('degree search maps resume wording onto Greenhouse degree labels', () => {
  assert.equal(degreeSearchValues('Bachelor of Science')[0], "Bachelor's Degree")
  assert.equal(degreeSearchValues('B.S.')[0], "Bachelor's Degree")
  assert.equal(degreeSearchValues('MBA')[0], 'Master of Business Administration (M.B.A.)')
  assert.equal(degreeSearchValues('PhD')[0], 'Doctor of Philosophy (Ph.D.)')
  assert.deepEqual(degreeSearchValues(''), [])
})

test('discipline aliases and degree prefixes', () => {
  assert.equal(disciplineSearchValues('CS')[0], 'Computer Science')
  assert.equal(disciplineSearchValues('B.S. Computer Science')[0], 'Computer Science')
})

test('school search drops parenthetical campus notes', () => {
  assert.deepEqual(schoolSearchValues('University of Michigan (Ann Arbor)'), [
    'University of Michigan (Ann Arbor)',
    'University of Michigan',
  ])
})

test('education dates parse ISO and month names, and ignore experience-only blanks', () => {
  assert.equal(monthNameFromLooseDate('2018-09-01'), 'September')
  assert.equal(monthNameFromLooseDate('May 2016'), 'May')
  assert.equal(monthNameFromLooseDate('2016'), null)
  assert.equal(yearFromLooseDate('May 2016'), '2016')
  assert.equal(yearFromLooseDate(''), null)
})

test('residence country questions are not the phone dialing-code field', () => {
  assert.equal(
    isResidenceCountryField('question_36622861002', 'whatisyourcurrentcountryofresidence'),
    true,
  )
  assert.equal(isResidenceCountryField('country', 'country'), false)
  assert.equal(
    isResidenceCountryField('question_1', 'willyourequirevisa sponsorship'),
    false,
  )
})

test('state questions skip statements and united states', () => {
  assert.equal(isStateQuestion('pleaseselectyourstate'), true)
  assert.equal(isStateQuestion('personalstatement'), false)
  assert.equal(isStateQuestion('unitedstates'), false)
})
