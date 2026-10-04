import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import { jobvitePlan, type JobviteField, type JobviteProfile } from './jobviteFields.ts'
import jobviteConfig, {
  describeJobviteField,
  isHostedJobvitePage,
  resetJobviteFormWatch,
} from './jobvite.ts'

const profile: JobviteProfile = {
  firstName: 'Ada',
  middleName: 'M',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '5551234567',
  phoneCountryCode: '+1',
  address: '1 Analytical Engine',
  city: 'San Francisco',
  state: 'CA',
  zip: '94107',
  country: 'united_states',
  linkedin: 'https://linkedin.com/in/ada',
  website: 'https://ada.example',
  github: 'https://github.com/ada',
  workAuthorization: 'us_citizen',
  sponsorshipRequired: 'No',
  gender: 'female',
  raceEthnicity: 'white',
  veteranStatus: 'not_a_veteran',
  disabilityStatus: 'no',
  age18OrOlder: 'yes',
  eeoAnswersEnabled: true,
  experience: [
    {
      companyName: 'Analytical Engines',
      jobTitle: 'Engineer',
      startDate: '2018-03',
      present: true,
      description: 'Built difference engines',
    },
    {
      companyName: 'Babbage Lab',
      jobTitle: 'Mathematician',
      startDate: '2014-01-15',
      endDate: '2018-02',
      description: 'Notes',
    },
  ],
  education: [
    {
      schoolName: 'University of London',
      degreeType: 'Bachelor of Science',
      major: 'Mathematics',
      startYear: '2010',
      graduationYear: '2014-06',
    },
  ],
}

function field(partial: JobviteField): JobviteField {
  return partial
}

const countryOptions = [
  { text: 'Select an option...', value: '' },
  { text: 'United States', value: 'United States' },
  { text: 'United States Minor Outlying Islands', value: 'United States Minor Outlying Islands' },
  { text: 'Canada', value: 'Canada' },
]

const stateOptions = [
  { text: 'Select an option...', value: '' },
  { text: 'Alabama', value: 'AL' },
  { text: 'Alaska', value: 'AK' },
  { text: 'California', value: 'CA' },
]

const workStatusOptions = [
  { text: 'None', value: 'None' },
  { text: 'US Citizen', value: 'US Citizen' },
  { text: 'Permanent Resident', value: 'Permanent Resident' },
  { text: 'H1 Visa', value: 'H1 Visa' },
  { text: 'TN Visa', value: 'TN Visa' },
  { text: 'F1 Visa', value: 'F1 Visa' },
  { text: 'Decline to Self Identify', value: 'Decline' },
]

test('contact labels and autocomplete map to the profile', () => {
  assert.deepEqual(jobvitePlan(field({ label: 'First Name', autocomplete: 'given-name' }), profile), {
    action: 'text',
    value: 'Ada',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Last Name', autocomplete: 'family-name' }), profile), {
    action: 'text',
    value: 'Lovelace',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Email', type: 'email' }), profile), {
    action: 'text',
    value: 'ada@example.com',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Phone', autocomplete: 'tel' }), profile), {
    action: 'text',
    value: '+1 5551234567',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Mobile Phone' }), profile), {
    action: 'text',
    value: '+1 5551234567',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'LinkedIn Profile' }), profile), {
    action: 'text',
    value: 'https://linkedin.com/in/ada',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Profile URL' }), profile), {
    action: 'text',
    value: 'https://linkedin.com/in/ada',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'City', autocomplete: 'address-level2' }), profile), {
    action: 'text',
    value: 'San Francisco',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Address' }), profile), {
    action: 'text',
    value: '1 Analytical Engine',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Preferred First Name' }), profile), {
    action: 'text',
    value: 'Ada',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Zip / Postal Code', autocomplete: 'postal-code' }), profile), {
    action: 'text',
    value: '94107',
  })
})

test('country and state selects prefer the exact option', () => {
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'Country', type: 'select-one', autocomplete: 'country-name', options: countryOptions }),
      profile,
    ),
    { action: 'select', optionText: 'United States' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'State', type: 'select-one', autocomplete: 'address-level1', options: stateOptions }),
      profile,
    ),
    { action: 'select', optionText: 'California' },
  )
  assert.deepEqual(jobvitePlan(field({ label: 'State', type: 'text' }), profile), {
    action: 'text',
    value: 'California',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'State', type: 'text' }), { ...profile, state: 'California' }), {
    action: 'text',
    value: 'California',
  })
})

test('a later city, state, or address is not copied from the contact row', () => {
  assert.deepEqual(jobvitePlan(field({ label: 'City' }), profile, 1), { action: 'skip' })
  assert.deepEqual(jobvitePlan(field({ label: 'Country', type: 'select-one', options: countryOptions }), profile, 1), {
    action: 'skip',
  })
})

test('work authorization, sponsorship, and work status stay within known options', () => {
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Are you legally authorized to work in the United States?',
        type: 'select-one',
        options: [
          { text: 'Select an option...', value: '' },
          { text: 'Yes', value: 'Yes' },
          { text: 'No', value: 'No' },
        ],
      }),
      profile,
    ),
    { action: 'select', optionText: 'Yes' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Will you now or in the future require sponsorship?',
        type: 'radio',
        optionLabel: 'No',
      }),
      profile,
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Will you now or in the future require sponsorship?',
        type: 'radio',
        optionLabel: 'Yes',
      }),
      profile,
    ),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: workStatusOptions }), profile),
    { action: 'select', optionText: 'US Citizen' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'Work Status', type: 'select-one', options: workStatusOptions }),
      { ...profile, workAuthorization: 'green_card' },
    ),
    { action: 'select', optionText: 'Permanent Resident' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'Work Status', type: 'select-one', options: workStatusOptions }),
      { ...profile, workAuthorization: 'work_visa', sponsorshipRequired: 'Yes' },
    ),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Are you authorized to work for any employer in the United States?',
        type: 'radio',
        optionLabel: 'Yes',
      }),
      { ...profile, workAuthorization: 'need_sponsorship' },
    ),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Are you authorized to work for any employer in the United States?',
        type: 'radio',
        optionLabel: 'No',
      }),
      { ...profile, workAuthorization: 'need_sponsorship' },
    ),
    { action: 'click' },
  )
})

test('authorized_no_sponsorship maps a citizenship Work Status menu to US Citizen', () => {
  // Live Internet Brands menu (jobs.jobvite.com/internetbrands/job/oH9MAfwW/apply):
  // None, US Citizen, Permanent Resident, H1 Visa, TN Visa, F1 Visa, Decline to Self Identify.
  const authorized = { ...profile, workAuthorization: 'authorized_no_sponsorship' }
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: workStatusOptions }), authorized),
    { action: 'select', optionText: 'US Citizen' },
  )

  const residentListedFirst = [
    { text: 'Select an option...', value: '' },
    { text: 'Permanent Resident', value: 'Permanent Resident' },
    { text: 'US Citizen', value: 'US Citizen' },
    { text: 'H1', value: 'H1' },
    { text: 'TN', value: 'TN' },
    { text: 'F1', value: 'F1' },
  ]
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: residentListedFirst }), authorized),
    { action: 'select', optionText: 'US Citizen' },
  )

  const permanentOnly = workStatusOptions.filter((option) => option.text !== 'US Citizen')
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: permanentOnly }), authorized),
    { action: 'select', optionText: 'Permanent Resident' },
  )

  const greenCardOnly = [
    { text: 'Select an option...', value: '' },
    { text: 'Green Card', value: 'Green Card' },
    { text: 'H1 Visa', value: 'H1 Visa' },
    { text: 'OPT', value: 'OPT' },
    { text: 'CPT', value: 'CPT' },
  ]
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: greenCardOnly }), authorized),
    { action: 'select', optionText: 'Green Card' },
  )

  const visasOnly = [
    { text: 'Select an option...', value: '' },
    { text: 'H1', value: 'H1' },
    { text: 'TN', value: 'TN' },
    { text: 'F1', value: 'F1' },
    { text: 'OPT', value: 'OPT' },
    { text: 'CPT', value: 'CPT' },
  ]
  assert.deepEqual(
    jobvitePlan(field({ label: 'Work Status', type: 'select-one', options: visasOnly }), authorized),
    { action: 'skip' },
  )

  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Work Status',
        type: 'select-one',
        options: [
          { text: 'Select an option...', value: '' },
          { text: 'Authorized without sponsorship', value: 'Authorized without sponsorship' },
          { text: 'Requires sponsorship', value: 'Requires sponsorship' },
        ],
      }),
      authorized,
    ),
    { action: 'select', optionText: 'Authorized without sponsorship' },
  )
})

test('EEO radios and selects follow the profile and leave prefer-not-to-say blank', () => {
  assert.deepEqual(
    jobvitePlan(field({ label: 'Gender', type: 'radio', optionLabel: 'Female' }), profile),
    { action: 'click' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Gender', type: 'radio', optionLabel: 'Male' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Gender', type: 'radio', optionLabel: 'Decline to self-identify' }), profile),
    { action: 'skip' },
  )
  assert.deepEqual(jobvitePlan(field({ label: 'Gender', type: 'radio', optionLabel: 'Female' }), { ...profile, gender: '' }), {
    action: 'skip',
  })

  const raceOptions = [
    { text: 'American Indian', value: 'American Indian' },
    { text: 'Asian', value: 'Asian' },
    { text: 'Black', value: 'Black' },
    { text: 'Hispanic', value: 'Hispanic' },
    { text: 'White', value: 'White' },
    { text: 'Native Hawaiian', value: 'Native Hawaiian' },
    { text: 'Two or more', value: 'Two or more' },
    { text: 'Decline', value: 'Decline' },
  ]
  assert.deepEqual(
    jobvitePlan(field({ label: 'Race', type: 'select-one', options: raceOptions }), profile),
    { action: 'select', optionText: 'White' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Race',
        type: 'select-one',
        options: [
          { text: 'Hispanic or Latino', value: 'hispanic' },
          { text: 'White (Not Hispanic or Latino)', value: 'white' },
          { text: 'Black or African American (Not Hispanic or Latino)', value: 'black' },
          { text: 'Asian (Not Hispanic or Latino)', value: 'asian' },
          { text: 'Caucasian', value: 'caucasian' },
        ],
      }),
      { ...profile, raceEthnicity: 'white' },
    ),
    { action: 'select', optionText: 'White (Not Hispanic or Latino)' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Race',
        type: 'select-one',
        options: [
          { text: 'Caucasian', value: 'caucasian' },
          { text: 'Asian (Not Hispanic or Latino)', value: 'asian' },
        ],
      }),
      { ...profile, raceEthnicity: 'asian' },
    ),
    { action: 'select', optionText: 'Asian (Not Hispanic or Latino)' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'Are you Hispanic or Latino?', type: 'radio', optionLabel: 'Yes' }),
      { ...profile, raceEthnicity: 'hispanic_or_latino' },
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'If no, please identify your race', type: 'select-one', options: raceOptions }),
      { ...profile, raceEthnicity: 'hispanic_or_latino' },
    ),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'If no, please identify your race', type: 'select-one', options: raceOptions }),
      profile,
    ),
    { action: 'select', optionText: 'White' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Veteran status',
        type: 'select-one',
        options: [
          { text: 'I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERAN', value: 'yes' },
          { text: 'I AM NOT A PROTECTED VETERAN', value: 'no' },
          { text: 'DECLINE SELF-IDENTIFICATION', value: 'decline' },
        ],
      }),
      profile,
    ),
    { action: 'select', optionText: 'I AM NOT A PROTECTED VETERAN' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Choose One',
        type: 'radio',
        optionLabel: 'I am a protected veteran',
      }),
      { ...profile, veteranStatus: 'veteran' },
    ),
    { action: 'click' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Disability',
        type: 'select-one',
        options: [
          { text: 'Yes, I have a disability', value: 'yes' },
          { text: 'No, I do not have a disability', value: 'no' },
          { text: 'Decline', value: 'decline' },
        ],
      }),
      { ...profile, disabilityStatus: 'yes' },
    ),
    { action: 'select', optionText: 'Yes, I have a disability' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Are you 18 years of age or older?', type: 'radio', optionLabel: 'Yes' }), profile),
    { action: 'click' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Are you 18 years of age or older?', type: 'radio', optionLabel: 'No' }), profile),
    { action: 'skip' },
  )
})

test('EEO stays blank when answers are off', () => {
  const off = { ...profile, eeoAnswersEnabled: false }
  assert.deepEqual(jobvitePlan(field({ label: 'Gender', type: 'radio', optionLabel: 'Female' }), off), {
    action: 'skip',
  })
  assert.deepEqual(
    jobvitePlan(field({ label: 'Are you 18 years of age or older?', type: 'radio', optionLabel: 'Yes' }), off),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Your Name', section: 'ofccp' }), off),
    { action: 'skip' },
  )
})

test('OFCCP signature uses the full name and the local date', () => {
  assert.deepEqual(jobvitePlan(field({ label: 'Your Name', section: 'ofccp' }), profile), {
    action: 'text',
    value: 'Ada M Lovelace',
  })
  assert.deepEqual(
    jobvitePlan(field({ label: "Today's Date", section: 'eeo' }), profile, 0, {
      now: new Date(2026, 9, 4),
    }),
    { action: 'text', value: '2026-10-04' },
  )
  assert.deepEqual(jobvitePlan(field({ label: "Today's Date", section: 'apply' }), profile), {
    action: 'skip',
  })
})

test('custom screening questions, resume files, and out-of-scope prompts are skipped', () => {
  for (const label of [
    'How did you hear about this job?',
    'Referral name',
    'Minimum desired salary',
    'Are you subject to a non-compete?',
    'Sms Consent',
    'County of Residence',
    'Have you previously worked here?',
    'When did you leave?',
    'Why do you want this job?',
    'Cover letter',
  ]) {
    assert.deepEqual(jobvitePlan(field({ label, type: 'text' }), profile), { action: 'skip' }, label)
  }
  assert.deepEqual(jobvitePlan(field({ label: 'Resume', type: 'file' }), profile), { action: 'skip' })
  assert.deepEqual(jobvitePlan(field({ label: 'Password', type: 'password' }), profile), { action: 'skip' })
  assert.equal(jobvitePlan(field({ label: 'Send Application', type: 'submit' }), profile).action, 'skip')
})

test('a plain resume file attaches when a filename is saved and skips autofill-from-resume controls', () => {
  const withFile = { ...profile, resumeFileName: 'ada-lovelace-resume.pdf' }
  assert.deepEqual(jobvitePlan(field({ label: 'Resume', type: 'file' }), withFile), {
    action: 'attachResume',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'CV', type: 'file' }), withFile), {
    action: 'attachResume',
  })
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'File', type: 'file', context: 'Type or paste your Resume here' }),
      withFile,
    ),
    { action: 'attachResume' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: '', type: 'file', context: 'Add Resume' }), withFile),
    { action: 'attachResume' },
  )
  assert.deepEqual(jobvitePlan(field({ label: 'Resume', type: 'file' }), profile), { action: 'skip' })
  assert.deepEqual(jobvitePlan(field({ label: 'Resume', type: 'text' }), withFile), { action: 'skip' })
  assert.deepEqual(
    jobvitePlan(field({ label: 'Autofill with Resume', type: 'file' }), withFile),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'Type or paste your Resume here', type: 'textarea' }), withFile),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(field({ label: 'LinkedIn', type: 'button', context: 'Add Resume' }), withFile),
    { action: 'skip' },
  )
  assert.deepEqual(
    jobvitePlan(
      field({ label: 'File', type: 'file', context: 'Type or paste your Cover Letter here' }),
      withFile,
    ),
    { action: 'skip' },
  )
  assert.deepEqual(jobvitePlan(field({ label: 'Cover letter', type: 'file' }), withFile), {
    action: 'skip',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'First Name' }), withFile), {
    action: 'text',
    value: 'Ada',
  })
})

test('experience and education use the row index and leave extra rows blank', () => {
  assert.deepEqual(jobvitePlan(field({ label: 'Company Name' }), profile, 0), {
    action: 'text',
    value: 'Analytical Engines',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Job Title' }), profile, 1), {
    action: 'text',
    value: 'Mathematician',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Company Name' }), profile, 2), { action: 'skip' })
  assert.deepEqual(jobvitePlan(field({ label: 'End Date' }), profile, 0), { action: 'skip' })
  assert.deepEqual(jobvitePlan(field({ label: 'Start Date' }), profile, 0), {
    action: 'text',
    value: '2018-03-01',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'End Date' }), profile, 1), {
    action: 'text',
    value: '2018-02-01',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Job responsibilities' }), profile, 0), {
    action: 'text',
    value: 'Built difference engines',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'School' }), profile, 0), {
    action: 'text',
    value: 'University of London',
  })
  assert.deepEqual(jobvitePlan(field({ label: 'Major / Field of study' }), profile, 0), {
    action: 'text',
    value: 'Mathematics',
  })
  assert.deepEqual(
    jobvitePlan(
      field({
        label: 'Degree',
        type: 'select-one',
        options: [
          { text: "Bachelor's", value: 'ba' },
          { text: "Master's", value: 'ma' },
          { text: 'Doctorate', value: 'phd' },
        ],
      }),
      profile,
    ),
    { action: 'select', optionText: "Bachelor's" },
  )
  assert.deepEqual(jobvitePlan(field({ label: 'Graduation Date' }), profile, 0), {
    action: 'text',
    value: '2014-06-01',
  })
})

const APPLY_HTML = `<!doctype html><body>
  <form class="jv-form jv-apply-form" name="scopeData.applyForm">
    <input id="alert" type="email" />
    <div class="jv-form-field" ng-model="applyData.fieldMap">
      <label class="jv-form-field-label" for="jv-field-first">First Name *</label>
      <input id="jv-field-first" autocomplete="given-name" type="text" />
    </div>
    <div class="jv-form-field" ng-model="applyData.fieldMap">
      <label class="jv-form-field-label">Email *</label>
      <input id="jv-field-email" type="email" autocomplete="email" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Phone *</label>
      <input id="jv-field-phone" type="tel" autocomplete="tel" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Country *</label>
      <select id="jv-field-country" autocomplete="country-name">
        <option value="">Select an option...</option>
        <option value="United States">United States</option>
        <option value="United States Minor Outlying Islands">United States Minor Outlying Islands</option>
      </select>
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">State *</label>
      <select id="jv-field-state" autocomplete="address-level1">
        <option value="">Select an option...</option>
        <option value="AL">Alabama</option>
        <option value="AK">Alaska</option>
        <option value="CA">California</option>
      </select>
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">City *</label>
      <input id="city-0" type="text" autocomplete="address-level2" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">City</label>
      <input id="city-1" type="text" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">How did you hear about us?</label>
      <input id="source" type="text" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Resume</label>
      <input id="resume" type="file" />
    </div>
    <div class="jv-form-field" ng-model="applyData.eeo">
      <div class="jv-form-field-legend">Gender</div>
      <div class="jv-input-group-row"><input id="gender-f" type="radio" name="gender" /> Female</div>
      <div class="jv-input-group-row"><input id="gender-m" type="radio" name="gender" /> Male</div>
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Company</label>
      <input id="company-0" type="text" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Company</label>
      <input id="company-1" type="text" />
    </div>
    <button type="button" id="next">Next</button>
    <button type="button" id="send">Send Application</button>
  </form>
  <form id="alerts">
    <label for="job-alert">Email</label>
    <input id="job-alert" type="email" />
  </form>
</body>`

test('the site rule fills a hosted apply form and leaves everything else blank', async () => {
  const dom = new JSDOM(APPLY_HTML)
  const doc = dom.window.document
  const rule = jobviteConfig()
  const info = profile as PersonalInfo

  const read = (id: string) => doc.getElementById(id) as HTMLInputElement

  assert.equal(await rule.apply(read('jv-field-first'), '', info), true)
  assert.equal(read('jv-field-first').value, 'Ada')
  assert.equal(await rule.apply(read('jv-field-email'), '', info), true)
  assert.equal(read('jv-field-email').value, 'ada@example.com')
  assert.equal(await rule.apply(read('jv-field-phone'), '', info), true)
  assert.equal(read('jv-field-phone').value, '+1 5551234567')

  const country = doc.getElementById('jv-field-country') as HTMLSelectElement
  assert.equal(await rule.apply(country, '', info), true)
  assert.equal(country.value, 'United States')

  const state = doc.getElementById('jv-field-state') as HTMLSelectElement
  assert.equal(await rule.apply(state, '', info), true)
  assert.equal(state.value, 'CA')

  assert.equal(await rule.apply(read('city-0'), '', info), true)
  assert.equal(read('city-0').value, 'San Francisco')
  assert.equal(await rule.apply(read('city-1'), '', info), 'skip')
  assert.equal(read('city-1').value, '')

  assert.equal(await rule.apply(read('source'), '', info), 'skip')
  assert.equal(read('source').value, '')
  assert.equal(await rule.apply(read('resume'), '', info), 'skip')
  assert.equal(read('resume').value, '')

  assert.equal(await rule.apply(read('gender-f'), '', info), true)
  assert.equal(read('gender-f').checked, true)
  assert.equal(await rule.apply(read('gender-m'), '', info), 'skip')
  assert.equal(read('gender-m').checked, false)

  assert.equal(await rule.apply(read('company-0'), '', info), true)
  assert.equal(read('company-0').value, 'Analytical Engines')
  assert.equal(await rule.apply(read('company-1'), '', info), true)
  assert.equal(read('company-1').value, 'Babbage Lab')

  assert.equal(await rule.apply(read('job-alert'), 'email', info), false)
  assert.equal(read('job-alert').value, '')

  const next = doc.getElementById('next') as HTMLButtonElement
  const send = doc.getElementById('send') as HTMLButtonElement
  let clicked = 0
  next.addEventListener('click', () => clicked++)
  send.addEventListener('click', () => clicked++)
  assert.equal(clicked, 0)
  assert.equal(describeJobviteField(read('jv-field-first')).label, 'First Name')
})

const RESUME_ATTACH_HTML = `<!doctype html><body>
  <form class="jv-apply-form">
    <div class="jv-form-field">
      <label class="jv-form-field-label">First Name</label>
      <input id="first" type="text" autocomplete="given-name" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Resume</label>
      <input id="resume" type="file" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">Autofill with Resume</label>
      <input id="autofill" type="file" />
    </div>
    <div class="jv-form-field">
      <label class="jv-form-field-label">How did you hear about us?</label>
      <input id="source" type="text" />
    </div>
    <button type="button" id="next">Next</button>
    <button type="button" id="send">Send Application</button>
  </form>
  <div class="jv-add-attachment" id="resume-menu">
    <label class="jv-visually-hidden">Type or paste your Resume here</label>
    <label for="file-input-0">File</label>
    <input id="file-input-0" type="file" />
    <span id="linkedin" role="button">LinkedIn</span>
    <span id="paste" role="button">Type or Paste Resume</span>
    <button type="button" id="select-resume">Select</button>
  </div>
  <div class="jv-add-attachment" id="cover-menu">
    <label class="jv-visually-hidden">Type or paste your Cover Letter here</label>
    <label for="file-input-1">File</label>
    <input id="file-input-1" type="file" />
  </div>
</body>`

function installFileInputSupport(window: JSDOM['window']) {
  const filesByInput = new WeakMap<object, { length: number; [index: number]: File }>()
  window.DataTransfer = class {
    items: { add: (file: File) => void }
    files!: { length: number; [index: number]: File }
    constructor() {
      const files: File[] = []
      this.items = {
        add(file: File) {
          files.push(file)
        },
      }
      Object.defineProperty(this, 'files', {
        get() {
          const list: { length: number; [index: number]: File } = { length: files.length }
          files.forEach((file, index) => {
            list[index] = file
          })
          return list
        },
      })
    }
  } as unknown as typeof DataTransfer
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
    configurable: true,
    get() {
      return filesByInput.get(this) ?? null
    },
    set(value) {
      filesByInput.set(this, value)
    },
  })
}

function fileName(input: HTMLInputElement): string {
  return input.files?.[0]?.name ?? ''
}

test('the site rule attaches the saved resume and leaves autofill-from-resume controls alone', async () => {
  const dom = new JSDOM(RESUME_ATTACH_HTML)
  installFileInputSupport(dom.window)
  const bytes = new TextEncoder().encode('%PDF-1.4 resume')
  let loads = 0
  const rule = jobviteConfig({
    loadResume: async () => {
      loads += 1
      return new File([bytes], 'ada-lovelace-resume.pdf', { type: 'application/pdf' })
    },
  })
  const info = { ...profile, resumeFileName: 'ada-lovelace-resume.pdf' } as PersonalInfo
  const doc = dom.window.document
  const read = (id: string) => doc.getElementById(id) as HTMLInputElement
  const clicks: string[] = []
  for (const id of ['next', 'send', 'linkedin', 'paste', 'autofill', 'select-resume']) {
    doc.getElementById(id)?.addEventListener('click', () => clicks.push(id))
  }
  const inputClick = dom.window.HTMLInputElement.prototype.click
  dom.window.HTMLInputElement.prototype.click = function clicked(this: HTMLInputElement) {
    clicks.push(`input:${this.id}`)
    return inputClick.call(this)
  }

  assert.equal(await rule.apply(read('first'), '', info), true)
  assert.equal(read('first').value, 'Ada')

  let changed = 0
  read('resume').addEventListener('change', () => changed++)
  assert.equal(await rule.apply(read('resume'), '', info), true)
  assert.equal(fileName(read('resume')), 'ada-lovelace-resume.pdf')
  assert.equal(changed, 1)

  assert.equal(await rule.apply(read('file-input-0'), '', info), true)
  assert.equal(fileName(read('file-input-0')), 'ada-lovelace-resume.pdf')
  assert.equal(describeJobviteField(read('file-input-0')).label, 'File')
  assert.match(describeJobviteField(read('file-input-0')).context || '', /Resume/)

  assert.equal(await rule.apply(read('file-input-1'), '', info), 'skip')
  assert.equal(fileName(read('file-input-1')), '')
  assert.equal(await rule.apply(read('autofill'), '', info), 'skip')
  assert.equal(fileName(read('autofill')), '')
  assert.equal(await rule.apply(read('source'), '', info), 'skip')
  assert.equal(read('source').value, '')
  assert.equal(loads, 2)
  assert.deepEqual(clicks, [])
})

test('the site rule leaves the resume control empty when no file is available', async () => {
  const dom = new JSDOM(RESUME_ATTACH_HTML)
  installFileInputSupport(dom.window)
  const rule = jobviteConfig({ loadResume: async () => null })
  const info = { ...profile, resumeFileName: 'ada-lovelace-resume.pdf' } as PersonalInfo
  const input = dom.window.document.getElementById('resume') as HTMLInputElement
  assert.equal(await rule.apply(input, '', info), 'skip')
  assert.equal(fileName(input), '')

  const unnamed = jobviteConfig({
    loadResume: async () => {
      throw new Error('should not load without a filename')
    },
  })
  assert.equal(await unnamed.apply(input, '', profile as PersonalInfo), 'skip')
  assert.equal(fileName(input), '')
})

test('hosted Jobvite URLs match and other ATS hosts do not', () => {
  assert.equal(
    isHostedJobvitePage({
      hostname: 'jobs.jobvite.com',
      href: 'https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply',
    }),
    true,
  )
  assert.equal(
    isHostedJobvitePage({
      hostname: 'Jobs.Jobvite.com',
      href: 'https://jobs.jobvite.com/sikichcareers/job/o4bKAfwj/apply',
    }),
    true,
  )
  assert.equal(
    isHostedJobvitePage({
      hostname: 'jobs.jobvite.com',
      href: 'https://jobs.jobvite.com/careers/kymanox/job/abc/apply',
    }),
    true,
  )
  assert.equal(
    isHostedJobvitePage({
      hostname: 'acme.jobvite.com',
      href: 'https://acme.jobvite.com/',
    }),
    true,
  )
  assert.equal(
    isHostedJobvitePage({
      hostname: 'jobs.lever.co',
      href: 'https://jobs.lever.co/acme/role/apply',
    }),
    false,
  )
})

test('formChanged refills only when the apply form gains controls', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <form class="jv-apply-form">
      <input id="a" />
      <input id="b" />
    </form>
  </body>`)
  const previous = globalThis.document
  Object.assign(globalThis, { document: dom.window.document })
  resetJobviteFormWatch()
  try {
    const rule = jobviteConfig()
    assert.equal(rule.formChanged?.([]), false)
    assert.equal(rule.formChanged?.([]), false)
    dom.window.document
      .querySelector('.jv-apply-form')
      ?.insertAdjacentHTML('beforeend', '<input id="c" /><select id="d"></select>')
    assert.equal(rule.formChanged?.([]), true)
    assert.equal(rule.formChanged?.([]), false)
    dom.window.document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="jv-add-attachment"><input id="late-file" type="file" /></div>',
    )
    assert.equal(rule.formChanged?.([]), true)
    assert.equal(rule.formChanged?.([]), false)
  } finally {
    resetJobviteFormWatch()
    Object.assign(globalThis, { document: previous })
  }
})
