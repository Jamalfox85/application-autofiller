// Pure mapping between PersonalInfo / CustomResponse and the per-profile Supabase schema
// (`candidate_profiles` + child tables). No supabase-js import, so node:test can load it.
// See ./profile.ts for the read/write calls and ./shared.ts for the overall sync model.
import { cloneDefaultPersonalInfo } from '../personalInfoDefaults.ts'
import { linkedinProfileUrl } from '../../utils/profileUrl.ts'
import { normalizeParsedResume, splitName } from '../parsedResume.ts'
import type { CustomResponse, Education, Experience, PersonalInfo } from '../../types/index.ts'

// Child-entry ids in the app are `number`s used only as Vue :keys and for in-session
// add/edit/remove tracking. They don't need to be stable across reloads, so every read hands
// back a fresh monotonic id per row.
export function makeClientIds(): () => number {
  let next = Date.now()
  return () => next++
}

// ---------------------------------------------------------------------------
// Scalar coercion
// ---------------------------------------------------------------------------

// The experience date inputs are <input type="month">: values are "YYYY-MM" or "". The DB
// columns are `date`, so we anchor to the first of the month on the way in and slice back to
// "YYYY-MM" on the way out.
function monthToDate(month?: string | null): string | null {
  const value = (month ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return null
}

function dateToMonth(date?: string | null): string {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '')
  return match ? `${match[1]}-${match[2]}` : ''
}

// A role the fill can order. Dates are "YYYY-MM" from the profile editor, or a
// longer ISO date from a parse. Missing pieces are not a date.
export type ExperienceRecency = {
  present?: boolean | null
  startDate?: string | null
  endDate?: string | null
}

function experienceDateValue(value: string | null | undefined): number | null {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec((value ?? '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : 1
  const day = match[3] ? Number(match[3]) : 1
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return year * 10000 + month * 100 + day
}

function isMoreRecentExperience(candidate: ExperienceRecency, incumbent: ExperienceRecency): boolean {
  const candidatePresent = candidate.present === true
  const incumbentPresent = incumbent.present === true
  if (candidatePresent !== incumbentPresent) return candidatePresent

  const candidateStart = experienceDateValue(candidate.startDate)
  const incumbentStart = experienceDateValue(incumbent.startDate)
  if (candidatePresent && incumbentPresent) {
    if (candidateStart == null) return false
    if (incumbentStart == null) return true
    return candidateStart > incumbentStart
  }

  // A past role is as recent as its end date, or its start date when it has no end.
  const candidateMark = experienceDateValue(candidate.endDate) ?? candidateStart
  const incumbentMark = experienceDateValue(incumbent.endDate) ?? incumbentStart
  if (candidateMark == null) return false
  if (incumbentMark == null) return true
  if (candidateMark !== incumbentMark) return candidateMark > incumbentMark
  if (candidateStart == null || incumbentStart == null || candidateStart === incumbentStart) return false
  return candidateStart > incumbentStart
}

// The job a "current company" / "current title" field should use. A present role
// wins. Otherwise the latest end date wins, then the latest start date. A tie
// keeps the earlier row.
export function currentExperience<T extends ExperienceRecency>(
  jobs: readonly T[] | null | undefined,
): T | undefined {
  if (!jobs || jobs.length === 0) return undefined
  let best = jobs[0]
  for (let i = 1; i < jobs.length; i++) {
    if (isMoreRecentExperience(jobs[i], best)) best = jobs[i]
  }
  return best
}

// Index 0 is the present or latest job. The other rows keep their saved order,
// so a second company field is the next saved role and not a copy of the current one.
export function experienceForFill<T extends ExperienceRecency>(
  jobs: readonly T[] | null | undefined,
): T[] {
  if (!jobs || jobs.length === 0) return []
  const current = currentExperience(jobs)
  if (!current) return []
  const rest: T[] = []
  let placed = false
  for (const job of jobs) {
    if (!placed && job === current) {
      placed = true
      continue
    }
    rest.push(job)
  }
  return [current, ...rest]
}

function gpaToNumeric(gpa?: string | null): number | null {
  if (gpa == null || gpa === '') return null
  const n = Number(gpa)
  if (!Number.isFinite(n) || n < 0) return null
  // The column is numeric(3,2): the largest value it accepts is 9.99. Round first, then drop
  // anything that lands on 10 ("9.995", "95", "10", "3.8/4.0"). Checking the raw number only
  // let 9.995 through as 10 and save_profile rejected the whole profile.
  const rounded = Math.round(n * 100) / 100
  return rounded < 10 ? rounded : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const nullIfEmpty = (v?: string | null): string | null => (v ? v : null)

// ---------------------------------------------------------------------------
// PersonalInfo -> save_profile payload
// ---------------------------------------------------------------------------

export type ProfileChildKey =
  | 'work_experience'
  | 'education'
  | 'skills'
  | 'other_links'
  | 'application_accounts'
  | 'custom_responses'

export interface ProfileDbRows {
  // `p_profile` for save_profile: candidate_profiles columns only.
  profile: Record<string, unknown>
  // `p_children` for save_profile. Every key present replaces that table for the profile.
  // A popup Save of a chrome.storage mirror that is older than the server row can
  // put cleared work_experience back. Skipping that replace means comparing the
  // mirror to the server's last write before save_profile. That check is not in
  // this mapping: a wrong one would drop a real edit. Follow-up after launch.
  children: Record<Exclude<ProfileChildKey, 'custom_responses'>, Record<string, unknown>[]>
}

// save_profile replaces any key that is present and nulls it. A resume parse that did not
// return phone, street, or ZIP must not send those columns (or an empty skills list) or the
// stored values disappear. Drop null scalars and empty child tables; keep everything the
// merged profile actually holds.
export function preserveServerWhenResumeParseOmits(rows: ProfileDbRows): ProfileDbRows {
  const profile: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rows.profile)) {
    if (value != null) profile[key] = value
  }
  const children: Record<string, Record<string, unknown>[]> = {}
  for (const [key, list] of Object.entries(rows.children)) {
    if (list.length > 0) children[key] = list
  }
  return { profile, children: children as ProfileDbRows['children'] }
}

export function profileToDbRows(info: PersonalInfo, profileId: string): ProfileDbRows {
  return {
    // `plan`, `id`, `user_id` and `name` are intentionally absent. The plan is server-owned
    // (POST /billing/plan, /billing/plan/refresh) and the name changes only via rename_profile.
    profile: {
      first_name: nullIfEmpty(info.firstName),
      middle_name: nullIfEmpty(info.middleName),
      last_name: nullIfEmpty(info.lastName),
      email: nullIfEmpty(info.email),
      phone: nullIfEmpty(info.phone),
      phone_country_code: info.phoneCountryCode || '+1',
      address: nullIfEmpty(info.address),
      address_line_2: nullIfEmpty(info.addressLine2),
      city: nullIfEmpty(info.city),
      state: nullIfEmpty(info.state),
      zip: nullIfEmpty(info.zip),
      country: nullIfEmpty(info.country),
      linkedin: nullIfEmpty(info.linkedin),
      website: nullIfEmpty(info.website),
      github: nullIfEmpty(info.github),
      // Omit when empty (save_profile keeps missing keys) so a profile save that has not
      // loaded the resume cannot null out a file the upload already stored.
      ...(info.resumeFileName ? { resume_file_name: info.resumeFileName } : {}),
      ...(info.resumeFilePath ? { resume_file_path: info.resumeFilePath } : {}),
      eeo_answers_enabled: info.eeoAnswersEnabled ?? true,
      gender: nullIfEmpty(info.gender),
      race_ethnicity: nullIfEmpty(info.raceEthnicity),
      disability_status: nullIfEmpty(info.disabilityStatus),
      veteran_status: nullIfEmpty(info.veteranStatus),
      age_18_or_older: nullIfEmpty(info.age18OrOlder),
      desired_salary: nullIfEmpty(info.desiredSalary),
      salary_negotiable: info.salaryNegotiable ?? false,
      work_authorization: nullIfEmpty(info.workAuthorization),
      sponsorship_required: nullIfEmpty(info.sponsorshipRequired),
      notice_period: nullIfEmpty(info.noticePeriod),
      account_email: nullIfEmpty(info.accountEmail),
      // Legacy Workday password. Same ciphertext prefix as application_accounts.password.
      account_password: nullIfEmpty(info.accountPassword),
    },
    children: {
      work_experience: (info.experience ?? []).map((exp, index) => ({
        profile_id: profileId,
        company_name: str(exp.companyName),
        job_title: str(exp.jobTitle),
        start_date: monthToDate(exp.startDate),
        end_date: exp.present ? null : monthToDate(exp.endDate),
        present: !!exp.present,
        description: nullIfEmpty(exp.description),
        location_city: nullIfEmpty(exp.locationCity),
        location_state: nullIfEmpty(exp.locationState),
        display_order: index,
      })),
      education: (info.education ?? []).map((edu, index) => ({
        profile_id: profileId,
        school_name: str(edu.schoolName),
        degree_type: nullIfEmpty(edu.degreeType),
        major: nullIfEmpty(edu.major),
        gpa: gpaToNumeric(edu.gpa),
        start_year: nullIfEmpty(edu.startYear),
        graduation_year: edu.current ? null : nullIfEmpty(edu.graduationYear),
        current: !!edu.current,
        location_city: nullIfEmpty(edu.locationCity),
        location_state: nullIfEmpty(edu.locationState),
        display_order: index,
      })),
      skills: (info.skills ?? [])
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name, index) => ({ profile_id: profileId, name, display_order: index })),
      other_links: (info.otherLinks ?? []).map((link, index) => ({
        profile_id: profileId,
        label: nullIfEmpty(link.label),
        url: nullIfEmpty(link.url),
        display_order: index,
      })),
      application_accounts: (info.applicationAccounts ?? []).map((acct, index) => ({
        profile_id: profileId,
        portal: nullIfEmpty(acct.portal),
        email: nullIfEmpty(acct.email),
        // Already AES-GCM ciphertext when the account key is available. Legacy
        // plaintext is encrypted on the next signed-in open, not here.
        password: nullIfEmpty(acct.password),
        require_confirmation: !!acct.requireConfirmation,
        display_order: index,
      })),
    },
  }
}

export function customResponsesToDbRows(
  responses: CustomResponse[],
  profileId: string,
): Record<string, unknown>[] {
  return responses.map((r) => ({
    profile_id: profileId,
    title: r.title || null,
    body: r.text || null,
    tags: r.tags ?? [],
  }))
}

// ---------------------------------------------------------------------------
// DB rows -> PersonalInfo
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export function dbRowsToProfile(rows: {
  profile: any
  work_experience?: any[]
  education?: any[]
  skills?: any[]
  other_links?: any[]
  application_accounts?: any[]
}): PersonalInfo {
  const p = rows.profile ?? {}
  const nextId = makeClientIds()

  const experience: Experience[] = (rows.work_experience ?? []).map((r) => ({
    id: nextId(),
    companyName: str(r.company_name),
    jobTitle: str(r.job_title),
    startDate: dateToMonth(r.start_date),
    endDate: dateToMonth(r.end_date),
    present: !!r.present,
    description: str(r.description),
    locationCity: str(r.location_city),
    locationState: str(r.location_state),
  }))

  const education: Education[] = (rows.education ?? []).map((r) => ({
    id: nextId(),
    schoolName: str(r.school_name),
    degreeType: str(r.degree_type),
    major: str(r.major),
    gpa: r.gpa == null ? '' : String(r.gpa),
    startYear: str(r.start_year),
    graduationYear: str(r.graduation_year),
    current: !!r.current,
    locationCity: str(r.location_city),
    locationState: str(r.location_state),
  }))

  const base = {
    ...cloneDefaultPersonalInfo(),
    firstName: str(p.first_name),
    middleName: str(p.middle_name),
    lastName: str(p.last_name),
    email: str(p.email),
    phone: str(p.phone),
    phoneCountryCode: str(p.phone_country_code) || '+1',
    address: str(p.address),
    addressLine2: str(p.address_line_2),
    city: str(p.city),
    state: str(p.state),
    zip: str(p.zip),
    country: str(p.country),
    // Saved before the www form: shown and filled as https://www.linkedin.com/...,
    // and stored that way on the next save.
    linkedin: linkedinProfileUrl(str(p.linkedin)),
    website: str(p.website),
    github: str(p.github),
    resumeFileName: str(p.resume_file_name),
    resumeFilePath: str(p.resume_file_path),
    eeoAnswersEnabled: p.eeo_answers_enabled ?? true,
    gender: str(p.gender),
    raceEthnicity: str(p.race_ethnicity),
    disabilityStatus: str(p.disability_status),
    veteranStatus: str(p.veteran_status),
    age18OrOlder: str(p.age_18_or_older),
    desiredSalary: str(p.desired_salary),
    salaryNegotiable: p.salary_negotiable ?? false,
    workAuthorization: str(p.work_authorization),
    sponsorshipRequired: str(p.sponsorship_required),
    noticePeriod: str(p.notice_period),
    accountEmail: str(p.account_email),
    accountPassword: str(p.account_password),
    experience,
    education,
    skills: (rows.skills ?? []).map((r) => str(r.name)).filter(Boolean),
    otherLinks: (rows.other_links ?? []).map((r) => ({
      id: nextId(),
      label: str(r.label),
      url: str(r.url),
    })),
    applicationAccounts: (rows.application_accounts ?? []).map((r) => ({
      id: nextId(),
      portal: str(r.portal),
      email: str(r.email),
      password: str(r.password),
      requireConfirmation: !!r.require_confirmation,
    })),
  }
  const withSnapshot = withParseSnapshotFallback(base, p, nextId)
  // Only full_name was set: split it so first/last name fields are not blank.
  if (!withSnapshot.firstName && !withSnapshot.lastName && str(p.full_name).trim()) {
    const { first, middle, last } = splitName(str(p.full_name).trim())
    return { ...withSnapshot, firstName: first, middleName: withSnapshot.middleName || middle, lastName: last }
  }
  return withSnapshot
}

// A resume parse can leave the parsed JSON snapshot (contact, work_history, education, skills,
// full_name) on the profile row while the editable columns and child tables stay empty. The
// popup then showed empty Personal details / Work / Education. When the editable data is
// entirely empty, rebuild it from that snapshot so the user sees (and can save) what was parsed.
export function withParseSnapshotFallback(
  info: PersonalInfo,
  p: Record<string, any>,
  nextId: () => number,
): PersonalInfo {
  const editableIsEmpty =
    !info.firstName &&
    !info.lastName &&
    !info.phone &&
    !info.address &&
    !info.city &&
    info.experience.length === 0 &&
    info.education.length === 0 &&
    info.skills.length === 0
  if (!editableIsEmpty) return info

  const hasSnapshot =
    (p.contact && typeof p.contact === 'object' && Object.keys(p.contact).length > 0) ||
    (Array.isArray(p.work_history) && p.work_history.length > 0) ||
    (Array.isArray(p.education) && p.education.length > 0) ||
    (Array.isArray(p.skills) && p.skills.length > 0)
  if (!hasSnapshot) return info

  const parsed = normalizeParsedResume({
    name: p.full_name,
    contact: p.contact,
    work_history: p.work_history,
    education: p.education,
    skills: p.skills,
  })
  const { education, experience, skills, fieldNotes: _notes, ...scalars } = parsed
  const filled: Record<string, unknown> = {}
  const current = info as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(scalars)) {
    // Never overwrite something the row already has (the seeded account email, for example).
    if (value && !current[key]) filled[key] = value
  }
  return {
    ...info,
    ...filled,
    experience: (experience ?? []).map((e) => ({ ...e, id: nextId() })),
    education: (education ?? []).map((e) => ({ ...e, id: nextId() })),
    skills: skills ?? [],
  }
}

export function dbRowsToCustomResponses(rows: any[] | null | undefined): CustomResponse[] {
  const nextId = makeClientIds()
  return (rows ?? []).map((r: any) => ({
    id: nextId(),
    title: typeof r.title === 'string' ? r.title : '',
    text: typeof r.body === 'string' ? r.body : '',
    tags: Array.isArray(r.tags) ? r.tags : [],
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// "Has the user actually entered anything?" Used by the one-time local->Supabase migration
// to decide whether local data is worth pushing and whether the remote row is already real.
// Set ignoreEmail when checking the remote row: handle_new_user seeds it with the auth email,
// so email alone doesn't mean the user has filled anything in.
export function profileHasSubstance(
  info: PersonalInfo | null | undefined,
  opts: { ignoreEmail?: boolean } = {},
): boolean {
  if (!info) return false
  return !!(
    info.firstName ||
    info.lastName ||
    info.phone ||
    info.address ||
    info.city ||
    info.linkedin ||
    info.website ||
    info.github ||
    info.resumeFileName ||
    info.resumeFilePath ||
    info.workAuthorization ||
    (info.experience?.length ?? 0) > 0 ||
    (info.education?.length ?? 0) > 0 ||
    (info.skills?.length ?? 0) > 0 ||
    (info.otherLinks?.length ?? 0) > 0 ||
    (info.applicationAccounts?.length ?? 0) > 0 ||
    (!opts.ignoreEmail && info.email)
  )
}
