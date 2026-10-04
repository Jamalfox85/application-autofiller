import type { PersonalInfo } from '../../types/index.ts'
import type { MatchEducation, MatchExperience, MatchProfile } from './types.ts'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean)
}

// Allowlist for POST /match-score. Contact info, EEO answers, salary, and
// portal credentials are never copied onto the result.
export function buildMatchProfile(info: Partial<PersonalInfo> | null | undefined): MatchProfile {
  const source = info ?? {}
  const experience: MatchExperience[] = Array.isArray(source.experience)
    ? source.experience.filter((row) => row && typeof row === 'object').map((row) => ({
        job_title: text(row.jobTitle),
        company_name: text(row.companyName),
        start_date: text(row.startDate),
        end_date: text(row.endDate),
        present: row.present === true,
        description: text(row.description),
      }))
    : []
  const education: MatchEducation[] = Array.isArray(source.education)
    ? source.education.filter((row) => row && typeof row === 'object').map((row) => ({
        degree_type: text(row.degreeType),
        major: text(row.major),
        graduation_year: text(row.graduationYear),
      }))
    : []

  return {
    skills: stringList(source.skills),
    experience,
    education,
    location: {
      city: text(source.city),
      state: text(source.state),
      country: text(source.country),
    },
    work_authorization: text(source.workAuthorization),
    sponsorship_required: text(source.sponsorshipRequired),
  }
}

export async function profileHash(profile: MatchProfile): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(profile))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
