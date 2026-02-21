import { FIELD_PATTERNS } from '../utils/fieldPatterns.ts'
import { tokenize, normalizeText, coverageRatio } from './helpers.ts'

import { PersonalInfo, SavedResponse } from '../types'

export function matchFieldToData(
  fieldText: string,
  personalInfo: PersonalInfo,
  savedResponses: SavedResponse[],
) {
  const normalizedFieldText = fieldText.toLowerCase().replace(/[\s_-]/g, '')

  // Special exclusion checks  i.e. - Don't match "city" if field contains these
  const exclusions: { [key: string]: string[] } = {
    address: ['city', 'postal', 'zip', 'state', 'country', 'province'], // Exclude these from address match
    city: ['ethnicity', 'ethnic', 'race'],
    state: ['estate', 'statement', 'realestate', 'unitedstates'],
    phone: ['indefinitely', 'extension'],
    major: ['degree'],
  }

  const response = matchFullNameField(normalizedFieldText, personalInfo)
  if (response) return { fieldValue: response.fieldValue, fieldKey: response.fieldKey }

  // Special case: Current loccation (May only be jobs.lever.co)
  if (normalizedFieldText.includes('location-input')) {
    const city = personalInfo.city || ''
    const state = personalInfo.state || ''
    return { fieldValue: `${city}, ${state}`.trim(), fieldKey: 'location' }
  }

  if (personalInfo.education && personalInfo.education.length > 0) {
    const response = matchEducationField(normalizedFieldText, personalInfo)
    if (response) return { fieldValue: response.fieldValue, fieldKey: response.fieldKey }
  }

  if (personalInfo.experience && personalInfo.experience.length > 0) {
    const response = matchExperienceField(normalizedFieldText, personalInfo)
    if (response) return { fieldValue: response.fieldValue, fieldKey: response.fieldKey }
  }

  // Check standard fields
  for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      const normalizedPattern = pattern.toLowerCase().replace(/[\s_-]/g, '')
      if (normalizedFieldText.includes(normalizedPattern)) {
        if (exclusions[key]) {
          const hasExclusion = exclusions[key].some((excl) =>
            normalizedFieldText.includes(excl.toLowerCase()),
          )
          if (hasExclusion) {
            continue // Skip this pattern match
          }
        }

        if (key === 'workAuthorization') {
          return {
            fieldValue: fieldText,
            fieldKey: key,
          }
        }
        console.log('field: ', fieldText)
        console.log('Matching key:', key)
        console.log('Pattern:', pattern)
        return { fieldValue: personalInfo[key as keyof PersonalInfo] || null, fieldKey: key }
      }
    }
  }

  // Eligibility Fields
  if (fieldText.includes('areyoueligible')) {
  }

  // Check special cases for saved responses
  const saved = matchSavedResponse(fieldText, savedResponses)
  if (saved != null) return { fieldValue: saved, fieldKey: 'savedResponse' }

  return null
}

function matchFullNameField(normalizedFieldText: string, personalInfo: PersonalInfo) {
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

  const isExplicitFullName = fullNamePositivePatterns.some((p) => normalizedFieldText.includes(p))
  const isPartialNameField = partialNamePatterns.some((p) => normalizedFieldText.includes(p))
  const isNonPersonName = nonPersonNamePatterns.some((p) => normalizedFieldText.includes(p))

  // Check for "name" that's likely asking for a person's full name
  // Must contain "name" but not be a partial or non-person name field
  const containsName = normalizedFieldText.includes('name')

  if (isExplicitFullName || (containsName && !isPartialNameField && !isNonPersonName)) {
    const firstName = personalInfo.firstName || ''
    const lastName = personalInfo.lastName || ''
    return { fieldValue: `${firstName} ${lastName}`.trim(), fieldKey: 'fullName' }
  }
}

function matchEducationField(normalizedFieldText: string, personalInfo: PersonalInfo) {
  console.log('EDUCATION FIELD: ', normalizedFieldText)
  const latestEducation = personalInfo.education[0]
  const schoolNamePatterns = FIELD_PATTERNS.schoolName
  const majorPatterns = FIELD_PATTERNS.major
  const degreePatterns = FIELD_PATTERNS.degreeType
  const graduationYearPatterns = FIELD_PATTERNS.graduationYear
  const gpaPatterns = FIELD_PATTERNS.gpa

  if (
    schoolNamePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestEducation.schoolName || null, fieldKey: 'schoolName' }
  }

  if (
    majorPatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestEducation.major || null, fieldKey: 'major' }
  }
  if (
    degreePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestEducation.degreeType || null, fieldKey: 'degreeType' }
  }

  if (
    graduationYearPatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestEducation.graduationYear || null, fieldKey: 'graduationYear' }
  }

  if (
    gpaPatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestEducation.gpa || null, fieldKey: 'gpa' }
  }
}

function matchExperienceField(normalizedFieldText: string, personalInfo: PersonalInfo) {
  const latestExperience = personalInfo.experience[0]
  const companyNamePatterns = FIELD_PATTERNS.companyName
  const descriptionPatterns = FIELD_PATTERNS.jobDescription
  const jobTitlePatterns = FIELD_PATTERNS.jobTitle
  const startDatePatterns = FIELD_PATTERNS.startDate
  const endDatePatterns = FIELD_PATTERNS.endDate

  if (
    companyNamePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestExperience.companyName || null, fieldKey: 'companyName' }
  }

  if (
    descriptionPatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestExperience.description || null, fieldKey: 'description' }
  }

  if (
    jobTitlePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestExperience.jobTitle || null, fieldKey: 'jobTitle' }
  }

  if (
    startDatePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    return { fieldValue: latestExperience.startDate || null, fieldKey: 'startDate' }
  }

  if (
    endDatePatterns.some((pattern) =>
      normalizedFieldText.includes(pattern.toLowerCase().replace(/[\s_-]/g, '')),
    )
  ) {
    console.log('Matched end date field: ', normalizedFieldText)
    console.log('Patterns: ', endDatePatterns)
    return { fieldValue: latestExperience.endDate || null, fieldKey: 'endDate' }
  }
}

/**

 * Autopopulate if:
 *  - >= 3 tags appear in fieldText (substring or token hit), OR
 *  - >= 80% of title tokens appear in fieldText
 *
 * Returns best matching savedResponse.text, else null
 */

function matchSavedResponse(fieldText: string, savedResponses: SavedResponse[]) {
  if (!fieldText || !Array.isArray(savedResponses) || savedResponses.length === 0) {
    return null
  }

  // Build token set once for fast membership checks
  const fieldTokens = new Set(tokenize(fieldText))

  let best = null

  for (const r of savedResponses) {
    const text = String(r?.text ?? '').trim()
    if (!text) continue

    // Keep this small and tuned to your domain; expand as needed.
    const STOPWORDS = new Set<string>([])

    const titleNorm = normalizeText(r?.title ?? '')
    const titleTokens = tokenize(titleNorm).filter((t) => !STOPWORDS.has(t))
    const titleCoverage = coverageRatio(titleTokens, fieldTokens) // 0..1

    // Tag hits (>= 3)
    // Treat "tag found" as: any token from that tag exists in fieldTokens.
    const tags = Array.isArray(r?.tags) ? r.tags : []
    const tagTokens = tags.map(normalizeText).flatMap(tokenize).filter(Boolean)

    const uniqueTagTokens = [...new Set(tagTokens)]
    let tagHits = 0
    for (const t of uniqueTagTokens) {
      if (fieldTokens.has(t)) tagHits++
    }

    const passes = tagHits >= 3 || titleCoverage >= 0.8
    if (!passes) continue

    // Prefer title match strongly; tags are secondary
    const score = titleCoverage * 1000 + tagHits * 10 + titleTokens.length

    if (!best || score > best.score) {
      best = { score, text }
    }
  }

  return best ? best.text : null
}
