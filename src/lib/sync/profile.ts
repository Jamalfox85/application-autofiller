// Maps PersonalInfo <-> the Supabase profile schema (profiles + child tables) and reads/writes
// it. See ./shared.ts for the overall sync model.
import { supabase } from '../supabase'
import { cloneDefaultPersonalInfo } from '../personalInfoDefaults'
import { makeClientIds, replaceUserRows } from './shared'
import type { Education, Experience, PersonalInfo } from '../../types'

// ---------------------------------------------------------------------------
// Scalar coercion
// ---------------------------------------------------------------------------

// The experience date inputs are <input type="month"> — values are "YYYY-MM" or "". The DB
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

function gpaToNumeric(gpa?: string | null): number | null {
  if (gpa == null || gpa === '') return null
  const n = Number(gpa)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const nullIfEmpty = (v?: string | null): string | null => (v ? v : null)

// ---------------------------------------------------------------------------
// PersonalInfo -> DB rows
// ---------------------------------------------------------------------------

interface ProfileDbRows {
  profile: Record<string, unknown>
  work_experience: Record<string, unknown>[]
  education: Record<string, unknown>[]
  skills: Record<string, unknown>[]
  other_links: Record<string, unknown>[]
  application_accounts: Record<string, unknown>[]
}

export function profileToDbRows(info: PersonalInfo, userId: string): ProfileDbRows {
  return {
    profile: {
      id: userId,
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
      resume_file_name: nullIfEmpty(info.resumeFileName),
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
      account_password: nullIfEmpty(info.accountPassword),
      synced_from_extension: true,
      updated_at: new Date().toISOString(),
    },
    work_experience: (info.experience ?? []).map((exp, index) => ({
      user_id: userId,
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
      user_id: userId,
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
      .map((name, index) => ({ user_id: userId, name, display_order: index })),
    other_links: (info.otherLinks ?? []).map((link, index) => ({
      user_id: userId,
      label: nullIfEmpty(link.label),
      url: nullIfEmpty(link.url),
      display_order: index,
    })),
    application_accounts: (info.applicationAccounts ?? []).map((acct, index) => ({
      user_id: userId,
      portal: nullIfEmpty(acct.portal),
      email: nullIfEmpty(acct.email),
      password: nullIfEmpty(acct.password),
      require_confirmation: !!acct.requireConfirmation,
      display_order: index,
    })),
  }
}

// ---------------------------------------------------------------------------
// DB rows -> PersonalInfo
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export function dbRowsToProfile(rows: {
  profile: any
  work_experience: any[]
  education: any[]
  skills: any[]
  other_links: any[]
  application_accounts: any[]
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

  return {
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
    linkedin: str(p.linkedin),
    website: str(p.website),
    github: str(p.github),
    resumeFileName: str(p.resume_file_name),
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
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

// Fetches the full profile for `userId`. Returns null only if there is no `profiles` row at
// all (there normally is — the handle_new_user trigger creates one on signup).
export async function fetchProfileFromDb(userId: string): Promise<PersonalInfo | null> {
  const [profileRes, expRes, eduRes, skillRes, linkRes, acctRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('work_experience').select('*').eq('user_id', userId).order('display_order'),
    supabase.from('education').select('*').eq('user_id', userId).order('display_order'),
    supabase.from('skills').select('*').eq('user_id', userId).order('display_order'),
    supabase.from('other_links').select('*').eq('user_id', userId).order('display_order'),
    supabase.from('application_accounts').select('*').eq('user_id', userId).order('display_order'),
  ])

  const error =
    profileRes.error ||
    expRes.error ||
    eduRes.error ||
    skillRes.error ||
    linkRes.error ||
    acctRes.error
  if (error) throw error

  if (!profileRes.data) return null

  return dbRowsToProfile({
    profile: profileRes.data,
    work_experience: expRes.data ?? [],
    education: eduRes.data ?? [],
    skills: skillRes.data ?? [],
    other_links: linkRes.data ?? [],
    application_accounts: acctRes.data ?? [],
  })
}

export async function saveProfileToDb(info: PersonalInfo, userId: string): Promise<void> {
  const rows = profileToDbRows(info, userId)

  const { error } = await supabase.from('profiles').upsert(rows.profile)
  if (error) throw error

  await replaceUserRows('work_experience', userId, rows.work_experience)
  await replaceUserRows('education', userId, rows.education)
  await replaceUserRows('skills', userId, rows.skills)
  await replaceUserRows('other_links', userId, rows.other_links)
  await replaceUserRows('application_accounts', userId, rows.application_accounts)
}

// "Has the user actually entered anything?" — used by the one-time local->Supabase migration
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
    info.workAuthorization ||
    (info.experience?.length ?? 0) > 0 ||
    (info.education?.length ?? 0) > 0 ||
    (info.skills?.length ?? 0) > 0 ||
    (info.otherLinks?.length ?? 0) > 0 ||
    (info.applicationAccounts?.length ?? 0) > 0 ||
    (!opts.ignoreEmail && info.email)
  )
}
