import type { PersonalInfo } from '../../types/index.ts'

export const PROFILE_ROSTER_KEY = 'profileRoster'

export interface RosterProfile {
  id: string
  name: string
  personalInfo: PersonalInfo
}

export interface ProfileRoster {
  activeId: string
  profiles: RosterProfile[]
}

function cloneInfo(info: PersonalInfo): PersonalInfo {
  return JSON.parse(JSON.stringify(info)) as PersonalInfo
}

export function initialRoster(personalInfo: PersonalInfo): ProfileRoster {
  return {
    activeId: 'primary',
    profiles: [{ id: 'primary', name: 'Primary', personalInfo: cloneInfo(personalInfo) }],
  }
}

export function addRosterProfile(roster: ProfileRoster, name: string, personalInfo: PersonalInfo): ProfileRoster {
  const id = `profile-${Date.now()}`
  const label = name.trim() || 'Profile'
  return {
    activeId: id,
    profiles: [...roster.profiles, { id, name: label, personalInfo: cloneInfo(personalInfo) }],
  }
}

export function withActiveSnapshot(roster: ProfileRoster, personalInfo: PersonalInfo): ProfileRoster {
  return {
    ...roster,
    profiles: roster.profiles.map((profile) =>
      profile.id === roster.activeId ? { ...profile, personalInfo: cloneInfo(personalInfo) } : profile,
    ),
  }
}

export async function readRoster(personalInfo: PersonalInfo): Promise<ProfileRoster> {
  const data = await chrome.storage.local.get(PROFILE_ROSTER_KEY)
  const stored = data[PROFILE_ROSTER_KEY] as ProfileRoster | undefined
  if (!stored?.profiles?.length || !stored.activeId) {
    const created = initialRoster(personalInfo)
    await chrome.storage.local.set({ [PROFILE_ROSTER_KEY]: created })
    return created
  }
  return stored
}

export async function writeRoster(roster: ProfileRoster): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_ROSTER_KEY]: roster })
}

export async function rememberActiveProfile(personalInfo: PersonalInfo): Promise<void> {
  try {
    const data = await chrome.storage.local.get(PROFILE_ROSTER_KEY)
    const stored = data[PROFILE_ROSTER_KEY] as ProfileRoster | undefined
    if (!stored?.activeId || !stored.profiles?.length) return
    await writeRoster(withActiveSnapshot(stored, personalInfo))
  } catch {
    // The live profile save already succeeded. The roster mirror can catch up later.
  }
}
