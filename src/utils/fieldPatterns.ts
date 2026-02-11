export const FIELD_PATTERNS = {
  firstName: [
    'firstname',
    'first_name',
    'first-name',
    'forename',
    'given-name',
    'givenname',
    'given_name',
  ],
  lastName: [
    'lastname',
    'last_name',
    'last-name',
    'surname',
    'family-name',
    'familyname',
    'family_name',
  ],
  email: [
    'email',
    'e-mail',
    'emailaddress',
    'email_address',
    'email-address',
    'mail',
    'user_email',
    'useremail',
  ],
  phone: [
    'phone',
    'phonenumber',
    'phone_number',
    'phone-number',
    'telephone',
    'mobile',
    'cell',
    'contact',
    'contact_number',
  ],
  address: [
    'address',
    'street',
    'streetaddress',
    'street_address',
    'street-address',
    'address1',
    'address_1',
    'address-1',
    'addr',
  ],
  city: ['city', 'town', 'locality', 'municipality'],
  state: [
    'state',
    'province',
    'region',
    'territory',
    'stateprovince',
    'state_province',
    'state-province',
  ],
  country: ['country', 'nation', 'residence', 'citizenship'],
  zip: [
    'zip',
    'zipcode',
    'zip_code',
    'zip-code',
    'postal',
    'postalcode',
    'postal_code',
    'postal-code',
    'postcode',
  ],
  linkedin: [
    'linkedin',
    'linkedin_url',
    'linkedinurl',
    'linkedin-url',
    'linkedin_profile',
    'linkedinprofile',
  ],
  website: [
    'website',
    'site',
    'homepage',
    'portfolio',
    'portfoliourl',
    'portfolio_url',
    'personal_website',
    'personalwebsite',
    'portfolio website',
  ],
  github: [
    'github',
    'github_url',
    'githuburl',
    'github-profile',
    'githubprofile',
    'github_profile',
  ],
  twitter: ['twitter', 'twitter_handle', 'twitterhandle', 'twitter-handle'],
  otherWebsite: [
    'otherwebsite',
    'other_website',
    'other-website',
    'additionalwebsite',
    'additional_website',
    'additional-website',
  ],
  // Education fields
  schoolName: [
    'school',
    'university',
    'college',
    'institution',
    'school_name',
    'schoolname',
    'university_name',
    'universityname',
    'institution',
  ],
  degreeType: [
    'degree',
    'degree_type',
    'degreetype',
    'degree_level',
    'education_level',
    'education_degree',
    'highest_education_level',
  ],
  major: [
    'major',
    // 'field',  // Too generic, causes false if site uses "field" in input attributes (i.e. id=jv-field-yhdqzfwb)
    'study',
    'field_of_study',
    'fieldofstudy',
    'major_subject',
    'concentration',
    'degree_subject',
    'discipline',
  ],
  graduationYear: [
    'graduation',
    'grad_year',
    'gradyear',
    'graduation_year',
    'graduationyear',
    'year_graduated',
    'completion_year',
  ],
  gpa: ['gpa', 'grade', 'grade_point', 'gradepoint', 'average'],
  // ... existing patterns ...

  // Demographic fields
  gender: ['gender', 'sex', 'gender_identity', 'genderidentity', 'gender-identity'],

  raceEthnicity: [
    'race',
    'ethnicity',
    'race_ethnicity',
    'raceethnicity',
    'race-ethnicity',
    'ethnic',
    'raceethnic',
    'race_ethnic',
  ],

  disabilityStatus: [
    'disability',
    'disability_status',
    'disabilitystatus',
    'disability-status',
    'disabled',
    'disability_self_id',
    'eeo_disability',
    'eeoc-disability',
  ],

  veteranStatus: [
    'veteran',
    'veteran_status',
    'veteranstatus',
    'veteran-status',
    'military',
    'military_status',
    'protected_veteran',
    'protectedveteran',
    'eeo_veteran',
  ],

  age18OrOlder: [
    'age',
    'age_18',
    'over_18',
    'over18',
    'age18',
    'legal_age',
    'legalage',
    'atleast18',
    'at_least_18',
  ],

  // Other information fields
  desiredSalary: [
    'salary',
    'desired_salary',
    'desiredsalary',
    'desired-salary',
    'expected_salary',
    'expectedsalary',
    'salary_expectation',
    'salaryexpectation',
    'compensation',
    'pay',
    'wage',
    'salary_requirement',
  ],

  workAuthorization: [
    'authorization',
    'work_authorization',
    'workauthorization',
    'work-authorization',
    'work_permit',
    'workpermit',
    'legal_work',
    'legalwork',
    'eligible',
    'eligible_work',
    'visa',
    'visa_status',
    'sponsorship',
  ],

  accountPassword: ['password', 'new-password'],
}

// // Helper function to match field names (bonus!)
// export function matchFieldPattern(fieldName: string, patterns) {
//   const cleanField = fieldName.toLowerCase().replace(/[\s_-]/g, '')

//   for (const pattern of patterns) {
//     const cleanPattern = pattern.replace(/[\s_-]/g, '')
//     if (cleanField === cleanPattern || cleanField.includes(cleanPattern)) {
//       return true
//     }
//   }
//   return false
// }
