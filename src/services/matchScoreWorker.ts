import { readEntitlement } from './billing/entitlementStore.ts'
import { resumeApiBaseUrl } from './billing/proApiContract.ts'
import { getValidAccessToken } from '../lib/api.ts'
import { cloneDefaultPersonalInfo } from '../lib/personalInfoDefaults.ts'
import { getUserIdOrNull } from '../lib/sync/shared.ts'
import { saveProfileToDb } from '../lib/sync/profile.ts'
import type { PersonalInfo } from '../types/index.ts'
import { ACTIVE_PROFILE_KEY, parseActiveProfile } from '../lib/sync/activeProfile.ts'
import { matchScoreCacheKey, matchScoreDismissedKey, matchScoreRateLimitKey } from './matchScore/cache.ts'
import { postMatchScoreDecline } from './matchScore/contract.ts'
import { fetchAllowedPosting } from './matchScore/fetchPosting.ts'
import { fulfillMatchScore, willRequestMatchScore, type CachedMatchScore } from './matchScore/fulfill.ts'
import { buildMatchProfile, profileHash } from './matchScore/profile.ts'
import { persistSkillChange } from './matchScore/skills.ts'
import { isMatchAts, type JdSource, type MatchAts } from './matchScore/types.ts'

interface MatchSender {
  tab?: { id?: number }
}

interface StorageLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

export interface MatchScoreDeps {
  storage: StorageLike
  fetchImpl: typeof fetch
  token: () => Promise<string | null>
  isPro: () => Promise<boolean>
  userId: () => Promise<string | null>
  // Saves to one candidate profile (save_profile). Called with the active mirror's id.
  saveProfile: (info: PersonalInfo, profileId: string) => Promise<void>
  sendToTopFrame: (tabId: number, message: unknown) => Promise<unknown>
  baseUrl: () => string
  apiKey: () => string | null
  now: () => number
}

const inflight = new Map<string, Promise<void>>()
const rememberedJd = new Map<string, { jdText: string; jdSource: JdSource; ats: MatchAts }>()
let seq = 0

function liveDeps(): MatchScoreDeps {
  return {
    storage: {
      get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
      set: (items) => chrome.storage.local.set(items),
      remove: (key) => chrome.storage.local.remove(key),
    },
    fetchImpl: fetch,
    async token() {
      try {
        return await getValidAccessToken()
      } catch {
        return null
      }
    },
    async isPro() {
      const entitlement = await readEntitlement()
      return entitlement.isPro
    },
    userId: () => getUserIdOrNull(),
    saveProfile: (info, profileId) => saveProfileToDb(info, profileId),
    sendToTopFrame: (tabId, message) => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }),
    baseUrl: () => resumeApiBaseUrl(import.meta.env.VITE_RESUME_API_URL as string | undefined),
    apiKey: () => (import.meta.env.VITE_RESUME_API_KEY as string | undefined) ?? null,
    now: () => Date.now(),
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function readProfile(storage: StorageLike): Promise<PersonalInfo> {
  const data = await storage.get('personalInfo')
  const stored = data.personalInfo
  if (!stored || typeof stored !== 'object') return cloneDefaultPersonalInfo()
  return { ...cloneDefaultPersonalInfo(), ...(stored as PersonalInfo) }
}

// The profile whose data is in the personalInfo mirror. Scores, declines and quick-answer
// skill writes all go to this one profile.
async function readActiveProfileId(storage: StorageLike): Promise<string | null> {
  try {
    const data = await storage.get(ACTIVE_PROFILE_KEY)
    return parseActiveProfile(data[ACTIVE_PROFILE_KEY])?.id ?? null
  } catch {
    return null
  }
}

async function relay(deps: MatchScoreDeps, sender: MatchSender, message: Record<string, unknown>) {
  const tabId = sender.tab?.id
  if (tabId == null) return
  try {
    await deps.sendToTopFrame(tabId, message)
  } catch {
    // The top frame has no listener yet. Autofill does not wait on this.
  }
}

async function score(
  request: Record<string, unknown>,
  sender: MatchSender,
  deps: MatchScoreDeps,
): Promise<{ ok: true; deduped?: boolean }> {
  const jobUrl = asString(request.jobUrl)
  const rescore = request.rescore === true
  const tabId = sender.tab?.id ?? 0
  const remembered = rememberedJd.get(`${tabId}:${jobUrl}`)
  let ats = asString(request.ats)
  let jdText = asString(request.jdText)
  let jdSource: JdSource | '' = request.jdSource === 'fetched' ? 'fetched' : request.jdSource === 'dom' ? 'dom' : ''
  if (rescore && remembered) {
    if (!jdText) jdText = remembered.jdText
    if (!ats) ats = remembered.ats
    if (!jdSource) jdSource = remembered.jdSource
  }
  if (!jobUrl || !isMatchAts(ats) || (jdSource !== 'dom' && jdSource !== 'fetched') || !jdText.trim()) {
    await relay(deps, sender, { action: 'matchScoreRender', seq: ++seq, jobUrl, view: 'hide', reason: 'error' })
    return { ok: true }
  }
  const atsName: MatchAts = ats
  const source: JdSource = jdSource
  rememberedJd.set(`${tabId}:${jobUrl}`, { jdText, jdSource: source, ats: atsName })

  const flightKey = `${tabId}:${jobUrl}`
  if (!rescore) {
    if (inflight.has(flightKey)) return { ok: true, deduped: true }
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    inflight.set(flightKey, gate)
    try {
      await scoreWithProfile(sender, deps, { jobUrl, ats: atsName, jdText, jdSource: source, rescore })
    } finally {
      release()
      inflight.delete(flightKey)
    }
    return { ok: true }
  }

  await scoreWithProfile(sender, deps, { jobUrl, ats: atsName, jdText, jdSource: source, rescore })
  return { ok: true }
}

async function scoreWithProfile(
  sender: MatchSender,
  deps: MatchScoreDeps,
  input: { jobUrl: string; ats: MatchAts; jdText: string; jdSource: JdSource; rescore: boolean },
) {
  const info = await readProfile(deps.storage)
  const profile = buildMatchProfile(info)
  const hash = await profileHash(profile)
  const profileId = await readActiveProfileId(deps.storage)
  await runScore({}, sender, deps, { ...input, hash, profile, profileId })
}

async function runScore(
  _request: Record<string, unknown>,
  sender: MatchSender,
  deps: MatchScoreDeps,
  input: {
    jobUrl: string
    ats: MatchAts
    jdText: string
    jdSource: JdSource
    rescore: boolean
    hash: string
    profile: ReturnType<typeof buildMatchProfile>
    profileId: string | null
  },
) {
  const cacheKey = matchScoreCacheKey(input.jobUrl, input.hash)
  const dismissedKey = matchScoreDismissedKey(input.jobUrl)
  const rateKey = matchScoreRateLimitKey(input.jobUrl)
  const stored = await deps.storage.get([cacheKey, dismissedKey, rateKey])
  const cached = stored[cacheKey] as CachedMatchScore | undefined
  const isPro = await deps.isPro()
  const token = isPro ? await deps.token() : null
  const common = {
    isPro,
    dismissed: stored[dismissedKey] != null,
    rateLimited: stored[rateKey] != null,
    rescore: input.rescore,
    cached: cached && cached.result ? cached : null,
    now: deps.now(),
    token,
    apiKey: deps.apiKey(),
    jdText: input.jdText,
  }
  if (willRequestMatchScore(common)) {
    await relay(deps, sender, {
      action: 'matchScoreRender',
      seq: ++seq,
      jobUrl: input.jobUrl,
      view: 'loading',
      ats: input.ats,
      jdSource: input.jdSource,
      requested: true,
    })
  }
  const outcome = await fulfillMatchScore({
    ...common,
    jobUrl: input.jobUrl,
    ats: input.ats,
    jdSource: input.jdSource,
    profile: input.profile,
    profileId: input.profileId,
    baseUrl: deps.baseUrl(),
    apiKey: deps.apiKey(),
    fetchImpl: deps.fetchImpl,
  })
  if (outcome.persistRateLimit) {
    await deps.storage.set({ [rateKey]: deps.now() })
  }
  if (outcome.cacheValue) {
    await deps.storage.set({ [cacheKey]: outcome.cacheValue })
  }
  await relay(deps, sender, {
    action: 'matchScoreRender',
    seq: ++seq,
    jobUrl: input.jobUrl,
    requested: false,
    ...outcome.relay,
  })
}

async function changeSkill(
  request: Record<string, unknown>,
  mode: 'add' | 'remove',
  deps: MatchScoreDeps,
): Promise<{ ok: boolean; skills?: string[]; saved?: boolean }> {
  const skill = asString(request.skill)
  if (!skill.trim()) return { ok: false }
  const info = await readProfile(deps.storage)
  return persistSkillChange(info, skill, mode, {
    write: (next) => deps.storage.set({ personalInfo: next }),
    // Signed in and a known active profile; the save goes to that profile only.
    userId: async () => ((await deps.userId()) ? await readActiveProfileId(deps.storage) : null),
    save: (next, profileId) => deps.saveProfile(next, profileId),
  })
}

async function decline(
  request: Record<string, unknown>,
  method: 'POST' | 'DELETE',
  deps: MatchScoreDeps,
): Promise<{ ok: boolean }> {
  const skill = asString(request.skill)
  const token = await deps.token()
  if (!token) return { ok: false }
  const result = await postMatchScoreDecline({
    skill,
    profileId: await readActiveProfileId(deps.storage),
    method,
    token,
    baseUrl: deps.baseUrl(),
    apiKey: deps.apiKey(),
    fetchImpl: deps.fetchImpl,
  })
  if (result.ok && method === 'POST') {
    const jobUrl = asString(request.jobUrl)
    if (jobUrl) {
      const info = await readProfile(deps.storage)
      const hash = await profileHash(buildMatchProfile(info))
      await deps.storage.remove(matchScoreCacheKey(jobUrl, hash))
    }
  }
  return result
}

export async function handleMatchScoreMessage(
  request: { action?: string } & Record<string, unknown>,
  sender: MatchSender = {},
  deps: MatchScoreDeps = liveDeps(),
): Promise<unknown> {
  try {
    switch (request.action) {
      case 'fetchJobPosting':
        return fetchAllowedPosting(asString(request.url), deps.fetchImpl)
      case 'matchScoreRelay': {
        const jobUrl = asString(request.jobUrl)
        const tabId = sender.tab?.id ?? 0
        const key = `relay:${tabId}:${jobUrl}:${asString(request.view)}`
        if (inflight.has(key)) return { ok: true, deduped: true }
        let release = () => {}
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        inflight.set(key, gate)
        try {
          await relay(deps, sender, {
            action: 'matchScoreRender',
            seq: ++seq,
            jobUrl,
            view: request.view,
            ats: request.ats,
            jdSource: request.jdSource,
            requested: false,
          })
          return { ok: true }
        } finally {
          release()
          inflight.delete(key)
        }
      }
      case 'matchScore':
        return score(request, sender, deps)
      case 'matchScoreAddSkill':
        return changeSkill(request, 'add', deps)
      case 'matchScoreRemoveSkill':
        return changeSkill(request, 'remove', deps)
      case 'matchScoreDecline':
        return decline(request, 'POST', deps)
      case 'matchScoreUndoDecline':
        return decline(request, 'DELETE', deps)
      default:
        return { ok: false }
    }
  } catch {
    await relay(deps, sender, {
      action: 'matchScoreRender',
      seq: ++seq,
      jobUrl: asString(request.jobUrl),
      view: 'hide',
      reason: 'error',
      requested: false,
    })
    return { ok: false, view: 'hide' }
  }
}
