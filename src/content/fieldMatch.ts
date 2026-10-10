import { FIELD_PATTERNS } from '../utils/fieldPatterns.ts'
import { matchCustomResponse } from '../utils/customResponses.ts'
import { coerceFillText } from '../utils/fillValue.ts'

import type { PersonalInfo, CustomResponse, Education, Experience } from '../types/index.ts'

function matchesPattern(fieldText: string, pattern: string): boolean {
  const normalized = pattern.toLowerCase().replace(/[\s_-]/g, '')
  if (!normalized || !fieldText.includes(normalized)) return false
  // "role" / "position" / "contact" / "site" are real field names and also ordinary words
  // inside screening questions. Suppress only those generic tokens on question prose.
  // Specific tokens ("address", "email", "jobtitle", "firstname") still match, including
  // when the label is long or phrased as a question ("What is your address?").
  if (isQuestionLikeField(fieldText) && GENERIC_QUESTION_PATTERNS.has(normalized)) return false
  return true
}

// Words that are both field patterns and ordinary English. They must not fire just because
// a screening question mentions them.
const GENERIC_QUESTION_PATTERNS = new Set([
  'role',
  'position',
  'contact',
  'site',
  'mail',
  'cell',
  'average',
  'grade',
  'description',
  'duties',
  'responsibilities',
  'residence',
  'citizenship',
  'notice',
  'availability',
])

// Sentence cues. A long Address / email label has none of these; "this role" and
// "are you" do. Length of the raw signature is not a cue: name + id + label + aria
// repeat, and a legitimate label ("Street address, including apartment...") crosses
// 70 characters without being a screening question.
const QUESTION_CUES = [
  'areyou',
  'doyou',
  'willyou',
  'haveyou',
  'didyou',
  'canyou',
  'legallyauthorized',
  'authorizedtowork',
  'requiresponsor',
  'thisrole',
  'thisposition',
]

// Screening questions ("Legally authorized to work?", "Are you comfortable with hybrid 4 days in
// office?") carry the whole question in the label and an opaque id such as question68839955.
// Generic substring patterns ("role", "position", "contact") hit these by accident and used to
// type a job title or the id itself into them.
export function isQuestionLikeField(fieldText: string): boolean {
  const withoutIds = fieldText.replace(/question_?\d{4,}/g, '')
  if (withoutIds.includes('?')) return true
  if (QUESTION_CUES.some((cue) => withoutIds.includes(cue))) return true
  // Prose that doesn't use those cues. Collapse name/id/label/aria copies first so a
  // repeated short label is not treated as a 70-character question.
  return collapsedLength(withoutIds) > 70
}

function collapsedLength(text: string): number {
  let out = text
  for (let guard = 0; guard < 8; guard++) {
    const next = stripOneRepeat(out)
    if (next === out) break
    out = next
  }
  return out.length
}

function stripOneRepeat(out: string): string {
  for (let len = Math.floor(out.length / 2); len >= 12; len--) {
    for (let i = 0; i + len <= out.length; i++) {
      const chunk = out.slice(i, i + len)
      const second = out.indexOf(chunk, i + len)
      if (second !== -1) return out.slice(0, second) + out.slice(second + len)
    }
  }
  return out
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
    const city = coerceFillText(personalInfo.city) || ''
    const state = coerceFillText(personalInfo.state) || ''
    const location = [city, state].filter(Boolean).join(', ')
    if (!location) return null
    return { matchedValue: location, relativeMatchKey: 'location' }
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
          // Answer from the vault, never from the field's own text. Sponsorship has its own
          // value; with nothing saved the question stays empty.
          const sponsorship = pattern.includes('sponsorship') || fieldText.includes('sponsor')
          const answer = coerceFillText(
            sponsorship ? personalInfo.sponsorshipRequired : personalInfo.workAuthorization,
          )
          if (!answer) continue
          return { matchedValue: answer, relativeMatchKey: key }
        }
        const text = coerceFillText(personalInfo[key as keyof PersonalInfo])
        if (!text) continue
        return {
          matchedValue: text,
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
    // BambooHR college is educationInstitutionName, label "College/University".
    // That string contains "name", but it is the school, not the applicant.
    'institutionname',
    'institution',
    'college',
    'university',
    'school',
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

  // Bare "name" inside a screening question ("name of your manager?") is not the
  // applicant. Explicit labels (full name, your name, first name) still match.
  const looseName =
    !isQuestionLikeField(fieldText) &&
    containsName &&
    !isPartialNameField &&
    !isNonPersonName &&
    !isCommonMalPattern
  if (isExplicitFullName || looseName) {
    const firstName = coerceFillText(personalInfo.firstName) || ''
    const lastName = coerceFillText(personalInfo.lastName) || ''
    const fullName = `${firstName} ${lastName}`.trim()
    if (!fullName) return
    return { matchedValue: fullName, relativeMatchKey: 'fullName' }
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
      const text = coerceFillText(latestEducation[key])
      if (!text) continue
      return { matchedValue: text, relativeMatchKey: key }
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
      const text = coerceFillText(latestExperience[dataKey])
      if (!text) continue
      return { matchedValue: text, relativeMatchKey: dataKey }
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
