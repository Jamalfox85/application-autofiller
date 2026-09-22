import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countrySearchValues,
  degreeSearchValues,
  disciplineSearchValues,
  greenhouseEducationRowsToAdd,
  isResidenceCountryField,
  isStateQuestion,
  locationSearchValues,
  monthNameFromLooseDate,
  parseGreenhouseEducationId,
  pickDegreeOption,
  pickDisciplineOption,
  pickMonthOption,
  pickSchoolOption,
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
    'University of Michigan - Ann Arbor',
    'University of Michigan Ann Arbor',
    'University of Michigan (Ann Arbor)',
    'University of Michigan',
    'Ann Arbor',
  ])
})

test('school search rewrites the smoke-seed UT Austin name to the Greenhouse catalog label', () => {
  const queries = schoolSearchValues('University of Texas at Austin')
  assert.equal(queries[0], 'University of Texas - Austin')
  assert.ok(queries.includes('University of Texas at Austin'))
})

test('school picker keeps UT Austin and rejects alphabetical neighbors such as Alverno', () => {
  const queries = schoolSearchValues('University of Texas at Austin')
  assert.equal(
    pickSchoolOption(
      [
        'Alverno College',
        'Austin College',
        'Stephen F. Austin State University',
        'University of Texas - Austin',
      ],
      queries,
    ),
    'University of Texas - Austin',
  )
  assert.equal(pickSchoolOption(['Aalborg University', 'Alverno College', 'Amherst College'], queries), null)
})

test('school picker does not treat MIT, Berkeley, Columbia, or Georgia Tech as a substring hit', () => {
  assert.equal(
    pickSchoolOption(
      ['Goldsmiths, University of London', 'Mitchell College', 'RMIT University', 'Smith College'],
      schoolSearchValues('MIT'),
    ),
    null,
  )
  assert.equal(
    pickSchoolOption(['Massachusetts Institute of Technology'], schoolSearchValues('MIT')),
    'Massachusetts Institute of Technology',
  )
  assert.equal(
    pickSchoolOption(
      [
        'Acupuncture and Integrative Medicine College - Berkeley',
        'Berkeley College',
        'University of California - Berkeley',
      ],
      schoolSearchValues('University of California, Berkeley'),
    ),
    'University of California - Berkeley',
  )
  assert.equal(
    pickSchoolOption(
      ['Columbia College', 'Columbia University'],
      schoolSearchValues('Columbia University'),
    ),
    'Columbia University',
  )
  assert.equal(
    pickSchoolOption(
      ['Arkansas Tech University', 'Ecole Polytechnique', 'Georgia Institute of Technology'],
      schoolSearchValues('Georgia Tech'),
    ),
    'Georgia Institute of Technology',
  )
  assert.equal(
    pickSchoolOption(
      ['Bloomsburg University of Pennsylvania', 'University of Pennsylvania'],
      schoolSearchValues('University of Pennsylvania'),
    ),
    'University of Pennsylvania',
  )
})

test('discipline search maps engineering abbreviations onto the Greenhouse catalog', () => {
  assert.equal(disciplineSearchValues('EE')[0], 'Engineering')
  assert.equal(disciplineSearchValues('Electrical Engineering')[0], 'Engineering')
  assert.equal(disciplineSearchValues('Statistics')[0], 'Statistics & Decision Theory')
})

test('discipline and degree pickers require the catalog label, not a substring', () => {
  assert.equal(pickDisciplineOption(['Engineering', 'Speech'], disciplineSearchValues('EE')), 'Engineering')
  assert.equal(
    pickDisciplineOption(['Economics', 'Physics', 'Speech'], disciplineSearchValues('CS')),
    null,
  )
  assert.equal(
    pickDisciplineOption(['Computer Science'], disciplineSearchValues('CS')),
    'Computer Science',
  )
  assert.equal(
    pickDisciplineOption(['Statistics & Decision Theory'], disciplineSearchValues('Statistics')),
    'Statistics & Decision Theory',
  )
  assert.equal(
    pickDegreeOption(
      ["Associate's Degree", "Bachelor's Degree", "Master's Degree", 'Other'],
      degreeSearchValues('Bachelor of Science'),
    ),
    "Bachelor's Degree",
  )
  assert.equal(
    pickDegreeOption(["Bachelor's Degree", "Master's Degree"], degreeSearchValues('Master of Science')),
    "Master's Degree",
  )
  assert.equal(pickMonthOption(['January', 'May', 'September'], 'September'), 'September')
  assert.equal(pickMonthOption(['Mayo', 'March'], 'May'), null)
})

test('education ids use the --N suffix and do not match employment ids', () => {
  assert.deepEqual(parseGreenhouseEducationId('school--0'), { index: 0, kind: 'school' })
  assert.deepEqual(parseGreenhouseEducationId('school--1'), { index: 1, kind: 'school' })
  assert.deepEqual(parseGreenhouseEducationId('degree--1'), { index: 1, kind: 'degree' })
  assert.deepEqual(parseGreenhouseEducationId('discipline--2'), { index: 2, kind: 'discipline' })
  assert.deepEqual(parseGreenhouseEducationId('start-month--0'), { index: 0, kind: 'start-month' })
  assert.deepEqual(parseGreenhouseEducationId('end-year--1'), { index: 1, kind: 'end-year' })
  for (const id of [
    'company-name-0',
    'title-1',
    'start-date-month-0',
    'start-date-year-1',
    'end-date-month-0',
    'current-role-0_1',
    'candidate-location',
    'school--',
    'school-0',
  ]) {
    assert.equal(parseGreenhouseEducationId(id), null, id)
  }
  assert.equal(greenhouseEducationRowsToAdd(1, 2), 1)
  assert.equal(greenhouseEducationRowsToAdd(2, 2), 0)
  assert.equal(greenhouseEducationRowsToAdd(0, 1), 0)
  assert.equal(greenhouseEducationRowsToAdd(0, 3), 3)
})

test('education dates parse ISO and month names, and ignore experience-only blanks', () => {
  assert.equal(monthNameFromLooseDate('2018-09-01'), 'September')
  assert.equal(monthNameFromLooseDate('2016-09'), 'September')
  assert.equal(monthNameFromLooseDate('2020-05'), 'May')
  assert.equal(monthNameFromLooseDate('May 2016'), 'May')
  assert.equal(monthNameFromLooseDate('Sep 2018'), 'September')
  assert.equal(monthNameFromLooseDate('09/2018'), 'September')
  assert.equal(monthNameFromLooseDate('2016'), null)
  assert.equal(yearFromLooseDate('May 2016'), '2016')
  assert.equal(yearFromLooseDate('2016-09'), '2016')
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
