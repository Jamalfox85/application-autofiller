// Account-level profile roster for the popup. Module-level state so App.vue, the Pro row and
// the Profiles modal share one list. Supabase decides everything (limit, Pro, locking,
// active id); this mirrors list_profiles and keeps the `activeProfile` mirror in sync.
import { computed, ref } from 'vue'
import { getValidAccessToken } from '../lib/api'
import { profilesApi } from '../lib/sync/profile'
import { MAX_PROFILES, type ProfileSummary } from '../lib/sync/profiles'
import {
  activeMirrorFromList,
  readActiveProfile,
  writeProfileMirrors,
  type ActiveProfileMirror,
} from '../lib/sync/activeProfile'
import {
  COPY_RESUME_FAILED_COPY,
  copyProfileResume,
  deleteResumeFile,
} from '../lib/sync/profileResume'
import { postPlanRefresh, readExtPayApiKey } from '../services/billing/planRefresh'
import { resumeApiBaseUrl } from '../services/billing/proApiContract'

const profiles = ref<ProfileSummary[]>([])
const loaded = ref(false)
// Last-known mirror; used before list_profiles answers and when offline.
const mirror = ref<ActiveProfileMirror | null>(null)

const activeProfile = computed<ProfileSummary | null>(
  () => profiles.value.find((p) => p.is_active) ?? null,
)
const activeMirror = computed<ActiveProfileMirror | null>(
  () => (loaded.value ? activeMirrorFromList(profiles.value) : null) ?? mirror.value,
)
const profileCount = computed(() => (loaded.value ? profiles.value.length : mirror.value?.profileCount ?? 1))
const atLimit = computed(() => profiles.value.length >= MAX_PROFILES)
const profileIds = computed(() => new Set(profiles.value.map((p) => p.id)))

function apiConfig() {
  return {
    baseUrl: resumeApiBaseUrl(import.meta.env.VITE_RESUME_API_URL as string | undefined),
    apiKey: (import.meta.env.VITE_RESUME_API_KEY as string | undefined) ?? null,
  }
}

// POST /billing/plan/refresh. Never throws; a failure keeps the plan the DB already has.
// Returns true when the server reported a plan change (so locks may have moved).
async function refreshServerPlan(): Promise<boolean> {
  try {
    const extpayApiKey = await readExtPayApiKey({
      sync: chrome.storage?.sync,
      local: chrome.storage?.local,
    })
    if (!extpayApiKey) return false
    const token = await getValidAccessToken()
    const result = await postPlanRefresh({ token, extpayApiKey, ...apiConfig() })
    if (!result.ok) console.warn('[profiles] plan refresh skipped', result.reason)
    return result.ok && result.changed
  } catch (error) {
    console.warn('[profiles] plan refresh failed', error)
    return false
  }
}

async function loadMirror(): Promise<ActiveProfileMirror | null> {
  mirror.value = await readActiveProfile(chrome.storage.local)
  return mirror.value
}

// list_profiles → state + activeProfile mirror. `verifyPlan` re-checks Pro first (modal open,
// before a swap). Throws ProfileError on failure.
async function refresh(opts: { verifyPlan?: boolean } = {}): Promise<ProfileSummary[]> {
  if (opts.verifyPlan) await refreshServerPlan()
  const list = await profilesApi().listProfiles()
  profiles.value = list
  loaded.value = true
  const active = activeMirrorFromList(list)
  if (active) {
    mirror.value = active
    await writeProfileMirrors(chrome.storage.local, { activeProfile: active })
  }
  return list
}

export type CreateResult = { id: string; resumeWarning: string | null }

async function create(name: string, copyFrom: string | null = null): Promise<CreateResult> {
  const id = await profilesApi().createProfile(name, copyFrom)
  let resumeWarning: string | null = null
  if (copyFrom) {
    const source = profiles.value.find((p) => p.id === copyFrom)
    if (!source || source.has_resume) {
      try {
        const token = await getValidAccessToken()
        const copied = await copyProfileResume({ token, profileId: id, fromProfileId: copyFrom, ...apiConfig() })
        if (copied.kind === 'failed') resumeWarning = COPY_RESUME_FAILED_COPY
      } catch {
        resumeWarning = COPY_RESUME_FAILED_COPY
      }
    }
  }
  await refresh()
  return { id, resumeWarning }
}

async function rename(id: string, name: string): Promise<void> {
  await profilesApi().renameProfile(id, name)
  await refresh()
}

async function activate(id: string): Promise<void> {
  await refreshServerPlan()
  await profilesApi().setActiveProfile(id)
  await refresh()
}

// Returns true when the deleted profile was the active one (caller reloads the new active).
async function remove(id: string): Promise<{ wasActive: boolean }> {
  const wasActive = activeProfile.value?.id === id
  const deleted = await profilesApi().deleteProfile(id)
  if (deleted.resume_file_path) {
    try {
      const token = await getValidAccessToken()
      const result = await deleteResumeFile({ token, resumeFilePath: deleted.resume_file_path, ...apiConfig() })
      if (!result.ok) console.warn('[profiles] resume file not deleted', result.status)
    } catch (error) {
      console.warn('[profiles] resume file not deleted', error)
    }
  }
  await refresh()
  return { wasActive }
}

function reset() {
  profiles.value = []
  loaded.value = false
  mirror.value = null
}

export function useProfiles() {
  return {
    profiles,
    loaded,
    activeProfile,
    activeMirror,
    profileCount,
    profileIds,
    atLimit,
    loadMirror,
    refresh,
    refreshServerPlan,
    create,
    rename,
    activate,
    remove,
    reset,
  }
}
