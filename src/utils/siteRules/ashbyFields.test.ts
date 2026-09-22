import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ashbyEducationDateValue,
  ashbyEducationTextValue,
  shouldRevealAshbyEducationEntry,
  ashbyEeoKind,
  ashbyEeoOptionMatches,
  ashbyEeoSearchLabels,
  ashbyEeoYesNo,
  ashbyDateSelectKind,
  ashbyFullName,
  ashbyLocationQueries,
  ashbyPhoneValue,
  ashbySchoolQueries,
  ashbyTextValue,
  ashbyYesNoDecision,
  isAshbyLocationField,
  isAshbyResumeField,
  isAshbySchoolField,
} from './ashbyFields.ts'

const profile = {
  firstName: 'Ada',
  middleName: 'M',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '5551234567',
  phoneCountryCode: '+1',
  city: 'San Francisco',
  state: 'California',
  country: 'united_states',
  linkedin: 'https://linkedin.com/in/ada',
  website: 'https://ada.example',
  github: 'https://github.com/ada',
  workAuthorization: 'us_citizen',
  sponsorshipRequired: 'No',
  gender: 'male',
  raceEthnicity: 'asian',
  veteranStatus: 'not_a_veteran',
  disabilityStatus: 'no',
  education: [
    {
      schoolName: 'U.C. Berkeley',
      degreeType: 'Bachelor of Science',
      major: 'Computer Science',
      startYear: '2016-09',
      graduationYear: '2020-05',
      current: false,
    },
  ],
  experience: [{ companyName: 'Analytical Engines', jobTitle: 'Engineer' }],
}

describe('Ashby profile text', () => {
  it('joins first, middle, and last name for _systemfield_name', () => {
    assert.equal(ashbyFullName(profile), 'Ada M Lovelace')
    assert.equal(
      ashbyTextValue({ path: '_systemfield_name', title: 'Name', type: 'text' }, profile),
      'Ada M Lovelace',
    )
  })

  it('does not treat a company name question as the candidate name', () => {
    assert.equal(
      ashbyTextValue({ path: 'company', title: 'Company Name', type: 'text' }, profile),
      'Analytical Engines',
    )
  })

  it('maps Render and LangChain contact, company, and title questions', () => {
    assert.equal(ashbyTextValue({ path: 'phone', title: 'Phone', type: 'text' }, profile), '+1 5551234567')
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'Location ', type: 'text' }, profile),
      'San Francisco, California',
    )
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'Current or Most Recent Company', type: 'text' }, profile),
      'Analytical Engines',
    )
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'Current or Most Recent Title', type: 'text' }, profile),
      'Engineer',
    )
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'Linkedin Profile Link', type: 'text' }, profile),
      'https://linkedin.com/in/ada',
    )
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'Preferred Name', type: 'text' }, profile),
      null,
    )
    assert.equal(
      ashbyTextValue({ path: 'question', title: 'How did you hear about Ambrook?', type: 'text' }, profile),
      null,
    )
    assert.equal(
      ashbyYesNoDecision(
        'Will you now, or in the future, require sponsorship (i.e. H-1B visa, etc.) to legally work in the U.S.?',
        profile,
      ),
      'no',
    )
  })

  it('maps the standard contact fields from path, type, or title', () => {
    assert.equal(
      ashbyTextValue({ path: '_systemfield_email', title: 'Email', type: 'email' }, profile),
      'ada@example.com',
    )
    assert.equal(ashbyPhoneValue(profile), '+1 5551234567')
    assert.equal(
      ashbyTextValue({ path: 'uuid', title: 'Phone Number', type: 'tel' }, profile),
      '+1 5551234567',
    )
    assert.equal(
      ashbyTextValue({ path: 'uuid', title: 'LinkedIn Profile', type: 'text' }, profile),
      'https://linkedin.com/in/ada',
    )
    assert.equal(
      ashbyTextValue({ path: 'uuid', title: 'GitHub', type: 'url' }, profile),
      'https://github.com/ada',
    )
    assert.equal(
      ashbyTextValue({ path: 'uuid', title: 'Website', type: 'url' }, profile),
      'https://ada.example',
    )
  })

  it('recognizes the resume dropzone and ignores other file uploads', () => {
    assert.equal(isAshbyResumeField({ path: '_systemfield_resume', title: 'Resume', type: 'file' }), true)
    assert.equal(isAshbyResumeField({ path: 'cover_letter', title: 'Cover Letter', type: 'file' }), false)
    assert.equal(
      ashbyTextValue({ path: '_systemfield_resume', title: 'Resume', type: 'file' }, profile),
      null,
    )
  })

  it('maps the first education degree and major by their input ids', () => {
    assert.equal(
      ashbyTextValue(
        { path: '_systemfield_education_history', id: '_systemfield_education_history-degree', title: 'Degree' },
        profile,
      ),
      'Bachelor of Science',
    )
    assert.equal(
      ashbyTextValue(
        { path: '_systemfield_education_history', id: '_systemfield_education_history-major', title: 'Field of Study' },
        profile,
      ),
      'Computer Science',
    )
  })
})

describe('Ashby location and school autocomplete', () => {
  it('searches city and state before the country label', () => {
    assert.deepEqual(ashbyLocationQueries(profile), [
      'San Francisco, California',
      'San Francisco',
      'California, United States',
      'United States',
    ])
  })

  it('recognizes the system location field even when the title asks for a country', () => {
    assert.equal(
      isAshbyLocationField('_systemfield_location', 'Which country do you intend to work from?'),
      true,
    )
    assert.equal(
      isAshbyLocationField('uuid', 'Will you now or in the future require sponsorship for employment visa status?'),
      false,
    )
  })

  it('recognizes the school typeahead and keeps degree inputs off it', () => {
    assert.equal(
      isAshbySchoolField(
        { path: '_systemfield_education_history', id: '' },
        { placeholder: 'Search schools...', autocomplete: true },
      ),
      true,
    )
    assert.equal(
      isAshbySchoolField(
        { path: '_systemfield_education_history', id: '_systemfield_education_history-degree' },
        { placeholder: 'e.g. Bachelor of Science', autocomplete: false },
      ),
      false,
    )
    assert.deepEqual(ashbySchoolQueries('U.C. Berkeley'), ['U.C. Berkeley', 'UC Berkeley'])
  })
})

describe('Ashby education dates', () => {
  it('tells month and year selects apart and formats the profile date', () => {
    assert.equal(ashbyDateSelectKind(['Month...', 'January', 'February']), 'month')
    assert.equal(ashbyDateSelectKind(['Year...', '2026', '2025']), 'year')
    assert.equal(
      ashbyEducationDateValue('_systemfield_education_history-startDate', 'month', profile),
      'September',
    )
    assert.equal(
      ashbyEducationDateValue('_systemfield_education_history-endDate', 'year', profile),
      '2020',
    )
  })

  it('does not invent an end date while the candidate is still a student', () => {
    const current = {
      ...profile,
      education: [{ ...profile.education[0], current: true, graduationYear: '2020-05' }],
    }
    assert.equal(
      ashbyEducationDateValue('_systemfield_education_history-endDate', 'year', current),
      '',
    )
  })

  it('fills the second education row and asks for it only when that row has data', () => {
    const two = {
      ...profile,
      education: [
        profile.education[0],
        {
          schoolName: 'Massachusetts Institute of Technology',
          degreeType: 'Master of Science',
          major: 'Mathematics',
          startYear: '2021-01',
          graduationYear: '2023-06',
          current: false,
        },
      ],
    }
    assert.equal(
      ashbyEducationTextValue('_systemfield_education_history-degree', two, 1),
      'Master of Science',
    )
    assert.equal(
      ashbyEducationTextValue('_systemfield_education_history-major', two, 1),
      'Mathematics',
    )
    assert.equal(
      ashbyEducationDateValue('_systemfield_education_history-startDate', 'month', two, 1),
      'January',
    )
    assert.equal(
      ashbyEducationDateValue('_systemfield_education_history-endDate', 'year', two, 1),
      '2023',
    )
    assert.equal(shouldRevealAshbyEducationEntry(1, two), true)
    assert.equal(shouldRevealAshbyEducationEntry(2, two), false)
    assert.equal(shouldRevealAshbyEducationEntry(1, profile), false)
    assert.equal(ashbyEducationTextValue('_systemfield_education_history-degree', two, 2), '')
  })
})

describe('Ashby yes/no and EEO questions', () => {
  it('answers sponsorship from the explicit flag and work authorization otherwise', () => {
    const title = 'Will you now or in the future require sponsorship for employment visa status?'
    assert.equal(ashbyYesNoDecision(title, profile), 'no')
    assert.equal(ashbyYesNoDecision(title, { ...profile, sponsorshipRequired: 'Yes' }), 'yes')
    assert.equal(
      ashbyYesNoDecision(title, { workAuthorization: 'need_sponsorship', sponsorshipRequired: '' }),
      'yes',
    )
    assert.equal(
      ashbyYesNoDecision('Are you legally authorized to work in the United States?', {
        workAuthorization: 'us_citizen',
      }),
      'yes',
    )
    assert.equal(
      ashbyYesNoDecision('Which country do you intend to work from?', profile),
      null,
    )
    assert.equal(
      ashbyYesNoDecision(
        'This role requires you to already be legally authorized to work in the countries listed in the job posting and 1Password will not be offering work authorization, relocation assistance, or sponsorship/transferring of a visa. Do you live in, and are you legally authorized to work in the countries listed in the job posting?',
        { workAuthorization: 'us_citizen', sponsorshipRequired: 'No' },
      ),
      'yes',
    )
    assert.equal(
      ashbyTextValue({ path: 'uuid', title: 'Current/Last Company', type: 'text' }, profile),
      'Analytical Engines',
    )
    assert.equal(
      ashbyYesNoDecision(
        'Will you now or in the future require Notion to sponsor an immigration case in order to employ you?',
        profile,
      ),
      'no',
    )
    assert.equal(
      ashbyYesNoDecision('Are you living in the country where this role is based and eligible to work there?', {
        workAuthorization: 'green_card',
      }),
      'yes',
    )
  })

  it('maps diversity survey options onto profile EEO values', () => {
    assert.equal(ashbyEeoKind('What is your gender identity?'), 'gender')
    assert.equal(ashbyEeoKind('Which ethnicity(ies) do you identify with?'), 'race')
    assert.equal(ashbyEeoOptionMatches('gender', 'Man', profile), true)
    assert.equal(ashbyEeoOptionMatches('gender', 'Woman', profile), false)
    assert.equal(ashbyEeoOptionMatches('race', 'Asian or Asian American', profile), true)
    assert.equal(ashbyEeoOptionMatches('race', 'White', profile), false)
    assert.equal(
      ashbyEeoOptionMatches('race', 'White (Not Hispanic or Latino)', {
        ...profile,
        raceEthnicity: 'hispanic_or_latino',
      }),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'Hispanic or Latino', {
        ...profile,
        raceEthnicity: 'hispanic_or_latino',
      }),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'Asian (Not Hispanic or Latino)', profile),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches('veteran', 'I am not a protected veteran', {
        ...profile,
        veteranStatus: 'veteran',
      }),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches(
        'veteran',
        'I identify as one or more of the classifications of protected veteran listed above',
        { ...profile, veteranStatus: 'veteran' },
      ),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'Hispanic or Latine', { ...profile, raceEthnicity: 'hispanic_or_latino' }),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'Indigenous or Native American', {
        ...profile,
        raceEthnicity: 'american_indian_or_alaska_native',
      }),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'I prefer not to answer', { ...profile, raceEthnicity: '' }),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches('race', 'I prefer not to answer', { ...profile, raceEthnicity: 'decline' }),
      true,
    )
    assert.equal(ashbyEeoOptionMatches('gender', 'I prefer not to answer', profile), false)
    assert.equal(ashbyEeoOptionMatches('gender', 'Another Gender Identity', { ...profile, gender: 'self_describe' }), true)
    assert.equal(
      ashbyEeoOptionMatches('veteran', 'I am not a protected veteran', profile),
      true,
    )
    assert.equal(ashbyEeoOptionMatches('disability', 'No, I do not have a disability', profile), true)
    assert.equal(ashbyEeoYesNo('veteran', profile), 'no')
    assert.deepEqual(ashbyEeoSearchLabels('gender', profile), ['Man', 'Male'])
  })

  it('maps the smoke fixture EEO values onto standard survey labels', () => {
    const fixture = {
      eeoAnswersEnabled: true,
      gender: 'female',
      raceEthnicity: 'white',
      veteranStatus: 'not_a_veteran',
      disabilityStatus: 'no',
    }
    assert.equal(ashbyEeoOptionMatches('gender', 'Female', fixture), true)
    assert.equal(ashbyEeoOptionMatches('gender', 'Woman', fixture), true)
    assert.equal(ashbyEeoOptionMatches('gender', 'Male', fixture), false)
    assert.equal(ashbyEeoOptionMatches('gender', 'Decline to self-identify', fixture), false)
    assert.equal(ashbyEeoOptionMatches('race', 'White', fixture), true)
    assert.equal(ashbyEeoOptionMatches('race', 'White (Not Hispanic or Latino)', fixture), true)
    assert.equal(ashbyEeoOptionMatches('race', 'Hispanic or Latino', fixture), false)
    assert.equal(ashbyEeoOptionMatches('race', 'Decline to self-identify', fixture), false)
    assert.equal(
      ashbyEeoOptionMatches('veteran', 'I am not a protected veteran', fixture),
      true,
    )
    assert.equal(
      ashbyEeoOptionMatches(
        'veteran',
        'I decline to self-identify for protected veteran status',
        fixture,
      ),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches(
        'veteran',
        'I identify as one or more of the classifications of protected veteran listed above',
        fixture,
      ),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches(
        'disability',
        'No, I do not have a disability and have not had one in the past',
        fixture,
      ),
      true,
    )
    assert.deepEqual(ashbyEeoSearchLabels('gender', fixture), ['Woman', 'Female'])
    assert.equal(ashbyEeoYesNo('disability', fixture), 'no')
    assert.equal(ashbyEeoYesNo('veteran', fixture), 'no')
    assert.equal(ashbyEeoYesNo('veteran', { veteranStatus: '' }), null)
    assert.deepEqual(ashbyEeoSearchLabels('gender', { gender: '' }), [])
  })

  it('skips EEO when answers are turned off or the stored value is empty', () => {
    assert.equal(
      ashbyEeoOptionMatches('gender', 'Man', { ...profile, eeoAnswersEnabled: false }),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches('gender', 'Prefer not to say', { ...profile, gender: '' }),
      false,
    )
    assert.equal(
      ashbyEeoOptionMatches('gender', 'Prefer not to say', { ...profile, gender: 'decline' }),
      true,
    )
    assert.deepEqual(ashbyEeoSearchLabels('gender', { ...profile, gender: '' }), [])
    assert.deepEqual(ashbyEeoSearchLabels('race', { ...profile, eeoAnswersEnabled: false }), [])
    assert.deepEqual(ashbyEeoSearchLabels('race', { ...profile, raceEthnicity: 'decline' }), [
      'Decline to self identify',
      'Prefer not to say',
      "I don't wish to answer",
    ])
  })
})
