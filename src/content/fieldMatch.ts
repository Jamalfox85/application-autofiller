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

  // Special case: full name
  const response = matchFullNameField(normalizedFieldText, personalInfo)
  if (response) return { fieldValue: response.fieldValue, fieldKey: response.fieldKey }

  // Special case: Current loccation (May only be jobs.lever.co)
  if (normalizedFieldText.includes('location-input')) {
    const city = personalInfo.city || ''
    const state = personalInfo.state || ''
    return { fieldValue: `${city}, ${state}`.trim(), fieldKey: 'location' }
  }

  // Education fields - use most recent education entry
  if (personalInfo.education && personalInfo.education.length > 0) {
    const latestEducation = personalInfo.education[0]

    if (
      normalizedFieldText.includes('school') ||
      normalizedFieldText.includes('university') ||
      normalizedFieldText.includes('college') ||
      normalizedFieldText.includes('institution')
    ) {
      return { fieldValue: latestEducation.schoolName || null, fieldKey: 'schoolName' }
    }

    if (
      normalizedFieldText.includes('major') ||
      normalizedFieldText.includes('study') ||
      normalizedFieldText.includes('subject')
    ) {
      return { fieldValue: latestEducation.major || null, fieldKey: 'major' }
    }
    if (normalizedFieldText.includes('degree') && !normalizedFieldText.includes('type')) {
      return { fieldValue: latestEducation.degreeType || null, fieldKey: 'degreeType' }
    }

    if (
      normalizedFieldText.includes('graduation') ||
      (normalizedFieldText.includes('year') && normalizedFieldText.includes('grad'))
    ) {
      return { fieldValue: latestEducation.graduationYear || null, fieldKey: 'graduationYear' }
    }

    if (normalizedFieldText.includes('gpa')) {
      return { fieldValue: latestEducation.gpa || null, fieldKey: 'gpa' }
    }
  }

  // Experience fields - use most recent experience entry
  if (personalInfo.experience && personalInfo.experience.length > 0) {
    const latestExperience = personalInfo.experience[0]

    if (
      normalizedFieldText.includes('company') ||
      normalizedFieldText.includes('employer') ||
      normalizedFieldText.includes('organization')
    ) {
      return { fieldValue: latestExperience.companyName || null, fieldKey: 'companyName' }
    }

    if (
      normalizedFieldText.includes('description') ||
      normalizedFieldText.includes('responsibilities') ||
      normalizedFieldText.includes('duties') ||
      normalizedFieldText.includes('professional background')
    ) {
      return { fieldValue: latestExperience.description || null, fieldKey: 'description' }
    }

    if (
      normalizedFieldText.includes('jobtitle') ||
      normalizedFieldText.includes('position') ||
      normalizedFieldText.includes('role') ||
      (normalizedFieldText.includes('title') && !normalizedFieldText.includes('degree'))
    ) {
      return { fieldValue: latestExperience.jobTitle || null, fieldKey: 'jobTitle' }
    }

    if (
      normalizedFieldText.includes('startdate') ||
      (normalizedFieldText.includes('start') && normalizedFieldText.includes('date'))
    ) {
      return { fieldValue: latestExperience.startDate || null, fieldKey: 'startDate' }
    }

    if (
      normalizedFieldText.includes('enddate') ||
      (normalizedFieldText.includes('end') && normalizedFieldText.includes('date'))
    ) {
      return { fieldValue: latestExperience.endDate || null, fieldKey: 'endDate' }
    }
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
        // console.log('field: ', fieldText)
        // console.log('Matching key:', key)
        // console.log('Pattern:', pattern)
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
    const STOPWORDS = new Set([])

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
