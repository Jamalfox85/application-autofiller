// Reads/writes one candidate profile (candidate_profiles + child tables) through the
// multi-profile RPCs. Mapping lives in ./profileRows.ts; see ./shared.ts for the sync model.
//
// Every write goes through save_profile, which replaces the profile row and the child rows
// that are present in one transaction. Nothing here deletes by user_id any more.
import { supabase } from '../supabase'
import { createProfilesApi, type ProfilesApi } from './profiles'
import { dbRowsToCustomResponses, dbRowsToProfile, profileToDbRows } from './profileRows'
import type { CustomResponse, PersonalInfo } from '../../types'

export { dbRowsToProfile, profileHasSubstance, profileToDbRows } from './profileRows'

let api: ProfilesApi | null = null
export function profilesApi(): ProfilesApi {
  if (!api) api = createProfilesApi(supabase)
  return api
}

export interface ProfileBundle {
  id: string
  name: string
  isActive: boolean
  locked: boolean
  personalInfo: PersonalInfo
  customResponses: CustomResponse[]
}

// One round trip: profile row + every child table + custom responses. null = active profile.
export async function fetchProfileBundle(profileId: string | null): Promise<ProfileBundle> {
  const rows = await profilesApi().getProfile(profileId)
  return {
    id: String(rows.profile.id ?? profileId ?? ''),
    name: typeof rows.profile.name === 'string' ? rows.profile.name : '',
    isActive: rows.is_active === true,
    locked: rows.locked === true,
    personalInfo: dbRowsToProfile(rows),
    customResponses: dbRowsToCustomResponses(rows.custom_responses),
  }
}

export async function fetchProfileFromDb(profileId: string | null): Promise<PersonalInfo> {
  return (await fetchProfileBundle(profileId)).personalInfo
}

// Saves the profile row and the five profile child tables. Custom responses are left alone
// (they are saved on their own by ./customResponses.ts).
export async function saveProfileToDb(info: PersonalInfo, profileId: string): Promise<void> {
  const rows = profileToDbRows(info, profileId)
  await profilesApi().saveProfile(profileId, rows.profile, rows.children)
}
