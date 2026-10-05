// Maps CustomResponse <-> the per-profile `custom_responses` table. See ./shared.ts for the model.
import { supabase } from '../supabase'
import { customResponsesToDbRows, dbRowsToCustomResponses } from './profileRows'
import { profilesApi } from './profile'
import type { CustomResponse } from '../../types'

export async function fetchCustomResponsesFromDb(profileId: string): Promise<CustomResponse[]> {
  const { data, error } = await supabase
    .from('custom_responses')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at')
  if (error) throw error
  return dbRowsToCustomResponses(data)
}

// Replace-all for this profile only, atomically via save_profile. The list is small and the
// client ids don't map to DB uuids, so this is simpler than per-row upserts.
export async function saveCustomResponsesToDb(
  profileId: string,
  responses: CustomResponse[],
): Promise<void> {
  await profilesApi().saveProfile(profileId, null, {
    custom_responses: customResponsesToDbRows(responses, profileId),
  })
}
