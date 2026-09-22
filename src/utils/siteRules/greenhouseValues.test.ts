import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countrySearchValues,
  degreeSearchValues,
  disciplineSearchValues,
  greenhouseEducationRowsToAdd,
  isAuthorizedToWork,
  isResidenceCountryField,
  isStateQuestion,
  locationSearchValues,
  monthNameFromLooseDate,
  nativeMonthSelectValue,
  nativeSponsorshipSelectValue,
  nativeWorkAuthorizationSelectValue,
  nativeYearSelectValue,
  parseGreenhouseEducationId,
  pickDegreeOption,
  pickDisciplineOption,
  pickMonthOption,
  pickSchoolOption,
  pickSponsorshipOption,
  pickWorkAuthorizationOption,
  profileRequiresSponsorship,
  schoolSearchValues,
  sponsorshipSearchValues,
  stateSearchValues,
  workAuthorizationSearchValues,
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

// SpaceX "Are you legally authorized to work in the United States?" has no Yes/No.
const SPACEX_WORK_AUTH = [
  'I am authorized to work in the United States for any employer',
  'I am authorized to work in the United States for my present employer only',
  'I require sponsorship to work in the United States',
  'I am not authorized to work in the United States',
  'My status to work in the United States is unknown',
]

const YES_NO = ['No', 'Yes']

test('authorized_no_sponsorship is authorized and does not require sponsorship', () => {
  assert.equal(isAuthorizedToWork('authorized_no_sponsorship'), true)
  assert.equal(
    profileRequiresSponsorship({
      workAuthorization: 'authorized_no_sponsorship',
      sponsorshipRequired: 'No',
    }),
    false,
  )
  assert.equal(
    profileRequiresSponsorship({ workAuthorization: 'work_visa', sponsorshipRequired: '' }),
    true,
  )
  assert.equal(
    profileRequiresSponsorship({ workAuthorization: 'work_visa', sponsorshipRequired: 'No' }),
    false,
  )
})

test('work authorization picks the unrestricted sentence, not Yes, on SpaceX', () => {
  assert.equal(
    pickWorkAuthorizationOption(SPACEX_WORK_AUTH, 'authorized_no_sponsorship'),
    'I am authorized to work in the United States for any employer',
  )
  assert.equal(
    pickWorkAuthorizationOption(SPACEX_WORK_AUTH, 'us_citizen'),
    'I am authorized to work in the United States for any employer',
  )
  assert.equal(
    pickWorkAuthorizationOption(SPACEX_WORK_AUTH, 'green_card'),
    'I am authorized to work in the United States for any employer',
  )
  assert.deepEqual(workAuthorizationSearchValues('authorized_no_sponsorship'), [
    'any employer',
    'Yes',
  ])
})

test('work authorization picks exact Yes on a Yes/No menu', () => {
  assert.equal(pickWorkAuthorizationOption(YES_NO, 'authorized_no_sponsorship'), 'Yes')
  assert.equal(
    pickWorkAuthorizationOption(
      ['No', 'Yes, Netherlands Highly Skilled Migrant Visa', 'Yes'],
      'authorized_no_sponsorship',
    ),
    'Yes',
  )
})

test('work_visa prefers present-employer wording and still answers Yes when that is the menu', () => {
  assert.equal(
    pickWorkAuthorizationOption(SPACEX_WORK_AUTH, 'work_visa'),
    'I am authorized to work in the United States for my present employer only',
  )
  assert.equal(pickWorkAuthorizationOption(YES_NO, 'work_visa'), 'Yes')
})

test('need_sponsorship answers No, or the not-authorized sentence when Yes/No is absent', () => {
  assert.equal(pickWorkAuthorizationOption(YES_NO, 'need_sponsorship'), 'No')
  assert.equal(
    pickWorkAuthorizationOption(SPACEX_WORK_AUTH, 'need_sponsorship'),
    'I am not authorized to work in the United States',
  )
  assert.equal(pickWorkAuthorizationOption(SPACEX_WORK_AUTH, ''), null)
})

test('sponsorship No does not select an option that only contains "no" inside "not"', () => {
  const sentences = [
    'I will require sponsorship now or in the future',
    'I will not require sponsorship now or in the future',
  ]
  assert.equal(
    pickSponsorshipOption(sentences, false),
    'I will not require sponsorship now or in the future',
  )
  assert.equal(
    pickSponsorshipOption(sentences, true),
    'I will require sponsorship now or in the future',
  )
  assert.equal(pickSponsorshipOption(YES_NO, false), 'No')
  assert.equal(pickSponsorshipOption(YES_NO, true), 'Yes')
  assert.deepEqual(sponsorshipSearchValues(false), ['No', 'not require'])
})

const MONTH_SELECT = [
  { value: '', label: 'Month' },
  { value: '1', label: 'January' },
  { value: '6', label: 'June' },
  { value: '12', label: 'December' },
]

const YES_NO_SELECT = [
  { value: '', label: 'Select...' },
  { value: '0', label: 'No' },
  { value: '1', label: 'Yes' },
]

test('native employment month select uses the visible month name, not the blank placeholder', () => {
  assert.equal(nativeMonthSelectValue(MONTH_SELECT, 'June'), '6')
  assert.equal(nativeMonthSelectValue(MONTH_SELECT, 'December'), '12')
  assert.equal(nativeMonthSelectValue(MONTH_SELECT, 'May'), null)
})

test('native work-authorization select uses option labels, including sentence menus', () => {
  assert.equal(nativeWorkAuthorizationSelectValue(YES_NO_SELECT, 'authorized_no_sponsorship'), '1')
  assert.equal(nativeWorkAuthorizationSelectValue(YES_NO_SELECT, 'need_sponsorship'), '0')
  assert.equal(
    nativeWorkAuthorizationSelectValue(
      SPACEX_WORK_AUTH.map((label, index) => ({ value: String(index + 1), label })),
      'authorized_no_sponsorship',
    ),
    '1',
  )
  assert.equal(nativeWorkAuthorizationSelectValue(YES_NO_SELECT, ''), null)
})

test('native sponsorship select picks Yes or No from the visible label', () => {
  assert.equal(nativeSponsorshipSelectValue(YES_NO_SELECT, false), '0')
  assert.equal(nativeSponsorshipSelectValue(YES_NO_SELECT, true), '1')
  const sentences = [
    { value: 'need', label: 'I will require sponsorship now or in the future' },
    { value: 'ok', label: 'I will not require sponsorship now or in the future' },
  ]
  assert.equal(nativeSponsorshipSelectValue(sentences, false), 'ok')
  assert.equal(nativeSponsorshipSelectValue(sentences, true), 'need')
})

test('native year select assigns the 4-digit year and ignores a raw year-month label', () => {
  const years = [
    { value: '', label: 'Year' },
    { value: 'raw', label: '2020-06' },
    { value: '2020', label: '2020' },
    { value: '2021', label: '2021' },
  ]
  assert.equal(nativeYearSelectValue(years, '2020-06'), '2020')
  assert.equal(nativeYearSelectValue([{ value: 'raw', label: '2020-06' }], '2020-06'), null)
  assert.equal(yearFromLooseDate('2020-06'), '2020')
})
