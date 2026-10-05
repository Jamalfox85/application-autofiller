// Typed wrappers for the multi-profile RPCs (resume-api docs/multi-profiles.md). Every call
// goes through the user's supabase-js session; the database enforces the limit, the Pro
// check, locking, and atomic saves. Errors come back as SQLSTATE P0001 with the message set
// to exactly one code, which this module turns into a ProfileError.
//
// No supabase-js import here: callers pass the client (src/lib/supabase.ts in the app, a
// fake in tests).

export const MAX_PROFILES = 5

export const PROFILE_ERROR_CODES = [
  'not_authenticated',
  'not_found',
  'pro_required',
  'profile_limit',
  'name_taken',
  'invalid_name',
  'profile_locked',
  'last_profile',
  'invalid_payload',
] as const

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number] | 'unknown'

// User-facing copy for each code. `details` from Postgres is English for developers and is
// never shown raw.
export const PROFILE_ERROR_COPY: Record<ProfileErrorCode, string> = {
  not_authenticated: 'Please sign in again.',
  not_found: 'That profile no longer exists. Refresh and try again.',
  pro_required: 'More than one profile is a Pro feature.',
  profile_limit: `You can have up to ${MAX_PROFILES} profiles.`,
  name_taken: 'You already have a profile with that name.',
  invalid_name: 'Profile names need 1 to 60 characters.',
  profile_locked: 'Resubscribe to use this profile again.',
  last_profile: 'You need at least one profile.',
  invalid_payload: 'Something in this profile could not be saved. Check it and try again.',
  unknown: 'Something went wrong. Please try again.',
}

export class ProfileError extends Error {
  readonly code: ProfileErrorCode
  readonly original: unknown

  constructor(code: ProfileErrorCode, original?: unknown) {
    super(PROFILE_ERROR_COPY[code])
    this.name = 'ProfileError'
    this.code = code
    this.original = original
  }
}

export function profileErrorCode(error: unknown): ProfileErrorCode {
  if (error instanceof ProfileError) return error.code
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.trim()
      : ''
  return (PROFILE_ERROR_CODES as readonly string[]).includes(message)
    ? (message as ProfileErrorCode)
    : 'unknown'
}

export function profileErrorMessage(error: unknown): string {
  return PROFILE_ERROR_COPY[profileErrorCode(error)]
}

export interface ProfileSummary {
  id: string
  name: string
  display_order: number
  created_at: string
  updated_at: string
  hint: string | null
  resume_file_name: string | null
  has_resume: boolean
  is_active: boolean
  locked: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ProfileBundleRows {
  profile: Record<string, any>
  is_active: boolean
  locked: boolean
  work_experience: any[]
  education: any[]
  skills: any[]
  other_links: any[]
  application_accounts: any[]
  custom_responses: any[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// What the create flow (components/profiles/CreateProfile.vue) hands to the modal.
export interface CreateProfileRequest {
  name: string
  start: 'copy' | 'resume' | 'blank'
  copyFrom: string | null
  file: File | null
}

export interface DeletedProfile {
  deleted_profile_id: string
  resume_file_path: string | null
  active_profile_id: string
}

export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

async function call<T>(client: RpcClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc(fn, args)
  } catch (error) {
    throw new ProfileError(profileErrorCode(error), error)
  }
  if (result.error) throw new ProfileError(profileErrorCode(result.error), result.error)
  return result.data as T
}

function asSummary(row: Record<string, unknown>): ProfileSummary {
  return {
    id: String(row.id ?? ''),
    name: typeof row.name === 'string' ? row.name : '',
    display_order: typeof row.display_order === 'number' ? row.display_order : 0,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    hint: typeof row.hint === 'string' && row.hint.trim() ? row.hint : null,
    resume_file_name: typeof row.resume_file_name === 'string' ? row.resume_file_name : null,
    has_resume: row.has_resume === true,
    is_active: row.is_active === true,
    locked: row.locked === true,
  }
}

export function createProfilesApi(client: RpcClient) {
  return {
    async listProfiles(): Promise<ProfileSummary[]> {
      const data = await call<unknown>(client, 'list_profiles')
      return Array.isArray(data) ? data.map((row) => asSummary(row as Record<string, unknown>)) : []
    },

    // null = the active profile.
    async getProfile(profileId: string | null): Promise<ProfileBundleRows> {
      const data = await call<ProfileBundleRows | null>(client, 'get_profile', {
        p_profile_id: profileId,
      })
      if (!data || typeof data !== 'object' || !data.profile) throw new ProfileError('not_found')
      return data
    },

    // Returns the new id. The new profile is active.
    async createProfile(name: string, copyFrom: string | null = null): Promise<string> {
      const id = await call<string>(client, 'create_profile', { p_name: name, p_copy_from: copyFrom })
      if (typeof id !== 'string' || !id) throw new ProfileError('unknown')
      return id
    },

    async renameProfile(profileId: string, name: string): Promise<void> {
      await call<void>(client, 'rename_profile', { p_profile_id: profileId, p_name: name })
    },

    async setActiveProfile(profileId: string): Promise<void> {
      await call<void>(client, 'set_active_profile', { p_profile_id: profileId })
    },

    async deleteProfile(profileId: string): Promise<DeletedProfile> {
      const data = await call<DeletedProfile>(client, 'delete_profile', { p_profile_id: profileId })
      return {
        deleted_profile_id: String(data?.deleted_profile_id ?? profileId),
        resume_file_path:
          typeof data?.resume_file_path === 'string' && data.resume_file_path ? data.resume_file_path : null,
        active_profile_id: String(data?.active_profile_id ?? ''),
      }
    },

    // Atomic. Keys present in `children` replace that table for this profile; keys left out
    // are untouched. `profile` null leaves the profile row alone.
    async saveProfile(
      profileId: string,
      profile: Record<string, unknown> | null,
      children: Record<string, unknown[]> | null,
    ): Promise<string | null> {
      const data = await call<unknown>(client, 'save_profile', {
        p_profile_id: profileId,
        p_profile: profile,
        p_children: children,
      })
      return typeof data === 'string' ? data : null
    },
  }
}

export type ProfilesApi = ReturnType<typeof createProfilesApi>

// "Profile 2", "Profile 3", ... skipping names already in use (case-insensitive).
export function nextDefaultProfileName(existing: { name: string }[]): string {
  const taken = new Set(existing.map((p) => p.name.trim().toLowerCase()))
  for (let n = existing.length + 1; n < existing.length + 50; n++) {
    const candidate = `Profile ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `Profile ${Date.now()}`
}

// "Contract copy", "Contract copy 2", ... within the 60-char limit.
export function duplicateProfileName(existing: { name: string }[], sourceName: string): string {
  const taken = new Set(existing.map((p) => p.name.trim().toLowerCase()))
  const base = `${sourceName.trim().slice(0, 52)} copy`
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; n < 50; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return nextDefaultProfileName(existing)
}

export function isProfileNameTaken(existing: { id: string; name: string }[], name: string, exceptId?: string) {
  const wanted = name.trim().replace(/\s+/g, ' ').toLowerCase()
  return existing.some((p) => p.id !== exceptId && p.name.trim().replace(/\s+/g, ' ').toLowerCase() === wanted)
}
