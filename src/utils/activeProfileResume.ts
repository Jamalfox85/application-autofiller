// Where the saved resume of the active profile lives. The file path/name are on
// candidate_profiles (one row per profile); the account row only says which profile is active.
// Used by the content-script/worker resume loaders, which can't use supabase-js.

export type ResumeRow = { resume_file_path?: string | null; resume_file_name?: string | null }

export function candidateProfileResumeUrl(supabaseUrl: string, profileId: string): string {
  return (
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/candidate_profiles?id=eq.${encodeURIComponent(profileId)}` +
    '&select=resume_file_path,resume_file_name'
  )
}

export function accountActiveProfileUrl(supabaseUrl: string, userId: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=active_profile_id`
}

function firstRow(json: unknown): Record<string, unknown> | null {
  const row = Array.isArray(json) ? json[0] : json
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null
}

// `profileId` comes from the activeProfile mirror (what the fill is using). Without it, ask
// the account row for active_profile_id first.
export async function fetchActiveProfileResumeRow(
  getJson: (url: string) => Promise<unknown | null>,
  supabaseUrl: string,
  userId: string,
  profileId: string | null,
): Promise<ResumeRow | null> {
  let id = (profileId ?? '').trim()
  if (!id) {
    const account = firstRow(await getJson(accountActiveProfileUrl(supabaseUrl, userId)))
    id = typeof account?.active_profile_id === 'string' ? account.active_profile_id : ''
  }
  if (!id) return null
  const row = firstRow(await getJson(candidateProfileResumeUrl(supabaseUrl, id)))
  if (!row) return null
  return {
    resume_file_path: typeof row.resume_file_path === 'string' ? row.resume_file_path : null,
    resume_file_name: typeof row.resume_file_name === 'string' ? row.resume_file_name : null,
  }
}
