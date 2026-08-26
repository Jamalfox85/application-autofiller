import { FIELD_PATTERNS } from '../utils/fieldPatterns.ts'
import { matchCustomResponse } from '@/utils/customResponses.ts'

import { PersonalInfo, CustomResponse, Education, Experience } from '../types'
import { normalizeText } from '@/utils/helpers.ts'

function matchesPattern(fieldText: string, pattern: string): boolean {
  return fieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, ''))
}

export function matchFieldToData(
  fieldText: string,
  personalInfo: PersonalInfo,
  customResponses: CustomResponse[],
) {
  // Special exclusion checks  i.e. - Don't match "city" if field contains these
  const exclusions: { [key: string]: string[] } = {
    address: ['city', 'postal', 'zip', 'state', 'country', 'province'], // Exclude these from address match
    city: ['ethnicity', 'ethnic', 'race'],
    state: ['estate', 'statement', 'realestate', 'unitedstates'],
    country: ['zip'],
    phone: ['indefinitely', 'extension'],
    major: ['degree'],
    jobTitle: ['salary'],
  }

  const response = matchFullNameField(fieldText, personalInfo)
  if (response)
    return { matchedValue: response.matchedValue, relativeMatchKey: response.relativeMatchKey }

  // Special case: Current loccation (May only be jobs.lever.co)
  if (fieldText.includes('location-input')) {
    const city = personalInfo.city || ''
    const state = personalInfo.state || ''
    return { matchedValue: `${city}, ${state}`.trim(), relativeMatchKey: 'location' }
  }

  if (personalInfo.education && personalInfo.education.length > 0) {
    const response = matchEducationField(fieldText, personalInfo)
    if (response)
      return { matchedValue: response.matchedValue, relativeMatchKey: response.relativeMatchKey }
  }

  if (personalInfo.experience && personalInfo.experience.length > 0) {
    const response = matchExperienceField(fieldText, personalInfo)
    if (response)
      return { matchedValue: response.matchedValue, relativeMatchKey: response.relativeMatchKey }
  }

  // Check standard fields
  for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (matchesPattern(fieldText, pattern)) {
        if (exclusions[key]) {
          const hasExclusion = exclusions[key].some((excl) =>
            fieldText.includes(excl.toLowerCase()),
          )
          if (hasExclusion) {
            continue // Skip this pattern match
          }
        }

        const eeoKeys = ['gender', 'raceEthnicity', 'disabilityStatus', 'veteranStatus', 'age18OrOlder']
        if (eeoKeys.includes(key) && personalInfo.eeoAnswersEnabled === false) {
          continue
        }

        if (key === 'desiredSalary') {
          if (personalInfo.salaryNegotiable) {
            return { matchedValue: 'Negotiable', relativeMatchKey: key }
          }
          if (!personalInfo.desiredSalary) continue
        }

        // console.log(`Matched pattern "${pattern}" for key "${key}" in fieldText "${fieldText}"`)
        if (key === 'workAuthorization') {
          return {
            matchedValue: fieldText,
            relativeMatchKey: key,
          }
        }
        return {
          matchedValue: String(personalInfo[key as keyof PersonalInfo]) || null,
          relativeMatchKey: key,
        }
      }
    }
  }

  // Eligibility Fields
  if (fieldText.includes('areyoueligible')) {
  }

  // Check special cases for saved responses
  const saved = matchCustomResponse(fieldText, customResponses)
  if (saved != null) return { matchedValue: saved, relativeMatchKey: 'savedResponse' }

  return null
}

function matchFullNameField(fieldText: string, personalInfo: PersonalInfo) {
  console.log('Matching full name for field:', fieldText)
  const fullNamePositivePatterns = [
    'fullname',
    'full_name',
    'full-name',
    'legalname',
    'legal_name',
    'legal-name',
    'completename',
    'yourname',
    'your_name',
    'your-name',
    'candidatename',
    'applicantname',
  ]

  const partialNamePatterns = [
    'firstname',
    'first_name',
    'first-name',
    'fname',
    'givenname',
    'given_name',
    'given-name',
    'lastname',
    'last_name',
    'last-name',
    'lname',
    'surname',
    'familyname',
    'family_name',
    'family-name',
    'middlename',
    'middle_name',
    'middle-name',
    'mname',
    'preferredname',
    'preferred_name',
    'nickname',
    'maidenname',
    'maiden_name',
  ]

  const nonPersonNamePatterns = [
    'companyname',
    'company_name',
    'businessname',
    'business_name',
    'schoolname',
    'school_name',
    'universityname',
    'university_name',
    'employername',
    'employer_name',
    'referencename',
    'reference_name',
    'username',
    'user_name',
    'accountname',
    'account_name',
    'displayname',
    'display_name',
    'filename',
    'file_name',
    'fieldname',
    'field_name',
    'systemfield',
  ]
  const commonMalPatters = ['eeo', 'race']

  const isExplicitFullName = fullNamePositivePatterns.some((p) => fieldText.includes(p))
  const isPartialNameField = partialNamePatterns.some((p) => fieldText.includes(p))
  const isNonPersonName = nonPersonNamePatterns.some((p) => fieldText.includes(p))
  const isCommonMalPattern = commonMalPatters.some((p) => fieldText.includes(p))

  // Check for "name" that's likely asking for a person's full name
  // Must contain "name" but not be a partial or non-person name field
  const containsName = fieldText.includes('name')

  if (
    isExplicitFullName ||
    (containsName && !isPartialNameField && !isNonPersonName && !isCommonMalPattern)
  ) {
    const firstName = personalInfo.firstName || ''
    const lastName = personalInfo.lastName || ''
    return { matchedValue: `${firstName} ${lastName}`.trim(), relativeMatchKey: 'fullName' }
  }
}

const EDUCATION_FIELDS: Array<keyof Education> = [
  'schoolName',
  'major',
  'degreeType',
  'graduationYear',
  'gpa',
]

function matchEducationField(fieldText: string, personalInfo: PersonalInfo) {
  const latestEducation = personalInfo.education[0]

  for (const key of EDUCATION_FIELDS) {
    if (FIELD_PATTERNS[key].some((pattern) => matchesPattern(fieldText, pattern))) {
      return { matchedValue: latestEducation[key] || null, relativeMatchKey: key }
    }
  }
}

const EXPERIENCE_FIELDS: Array<{ patternKey: keyof typeof FIELD_PATTERNS; dataKey: keyof Experience }> = [
  { patternKey: 'companyName', dataKey: 'companyName' },
  { patternKey: 'jobDescription', dataKey: 'description' },
  { patternKey: 'jobTitle', dataKey: 'jobTitle' },
  { patternKey: 'startDate', dataKey: 'startDate' },
  { patternKey: 'endDate', dataKey: 'endDate' },
]

function matchExperienceField(fieldText: string, personalInfo: PersonalInfo) {
  const latestExperience = personalInfo.experience[0]

  for (const { patternKey, dataKey } of EXPERIENCE_FIELDS) {
    if (FIELD_PATTERNS[patternKey].some((pattern) => matchesPattern(fieldText, pattern))) {
      return { matchedValue: latestExperience[dataKey] || null, relativeMatchKey: dataKey }
    }
  }
}

/**

 * Autopopulate if:
 *  - >= 3 tags appear in fieldText (substring or token hit), OR
 *  - >= 80% of title tokens appear in fieldText
 *
 * Returns best matching savedResponse.text, else null
 */
