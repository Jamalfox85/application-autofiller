import { openProCheckout } from '../services/billing/client.ts'
import { readEntitlement } from '../services/billing/entitlementStore.ts'
import { extractJobDescription } from '../services/matchScore/extractors/index.ts'
import { matchScoreEnabled } from '../services/matchScore/flags.ts'
import { matchScoreIntent } from '../services/matchScore/intent.ts'
import { matchScoreDismissedKey } from '../services/matchScore/cache.ts'
import {
  readResumeMatchingEnabled,
  RESUME_MATCHING_KEY,
  resumeMatchingEnabled,
} from '../services/matchScore/setting.ts'
import {
  quickAnswerFor,
  type JdSource,
  type MatchAts,
  type ScoredMatch,
} from '../services/matchScore/types.ts'
import { isMatchAts } from '../services/matchScore/types.ts'
import { trackEvent } from '../services/mixpanelHttp.ts'
import { getProfileSetupCompletedAt, getProfileSetupSession } from '../services/profileSetupSession.ts'
import { detectAts } from '../utils/ats.ts'
import {
  hideMatchScoreCard,
  renderMatchScoreCard,
  type MatchScoreCardModel,
} from './matchScoreCard.ts'

interface RenderMessage {
  action?: string
  seq?: number
  jobUrl?: string
  view?: string
  reason?: string
  ats?: string
  jdSource?: string
  requested?: boolean
  score?: ScoredMatch
  missing?: Array<'skills' | 'experience_descriptions'>
  cached?: boolean
  latencyMs?: number
}

const sent = new Set<string>()
let formObserver: MutationObserver | null = null
let seenSeq = 0
let dismissedJob: string | null = null
let pending = false
let collapsed = false
let undoSkill: string | null = null
let undoTimer: ReturnType<typeof setTimeout> | undefined
let activeJobUrl: string | null = null
let activeAts: MatchAts | null = null
let activeSource: JdSource | null = null
let activeScore: ScoredMatch | null = null
let activeMissing = false
let lastJd = ''
let profileWatchInstalled = false
let suppressProfileWatch = 0
let urlWatchInstalled = false
let settingWatchInstalled = false
// Mirrors the popup switch so a render already in flight is dropped once it is off.
let userDisabled = false

function isTopFrame(): boolean {
  try {
    return window.top === window
  } catch {
    return false
  }
}

function analytics(event: string, extra: Record<string, unknown> = {}) {
  const score = activeScore
  void trackEvent(event, {
    ats: activeAts ?? undefined,
    jd_source: activeSource ?? undefined,
    score_bucket: score?.band,
    confidence: score?.confidence,
    score_version: score?.score_version,
    latency_ms: extra.latency_ms,
    cached: extra.cached,
  })
}

function rememberContext(message: RenderMessage) {
  if (typeof message.jobUrl === 'string' && message.jobUrl) activeJobUrl = message.jobUrl
  if (typeof message.ats === 'string' && isMatchAts(message.ats)) activeAts = message.ats
  if (message.jdSource === 'dom' || message.jdSource === 'fetched') activeSource = message.jdSource
}

function handlers() {
  return {
    onDismiss: () => {
      if (!activeJobUrl) {
        hideMatchScoreCard()
        return
      }
      dismissedJob = activeJobUrl
      void chrome.storage.local.set({ [matchScoreDismissedKey(activeJobUrl)]: Date.now() })
      analytics('match_score_dismissed')
      hideMatchScoreCard()
      activeScore = null
    },
    onToggle: () => {
      collapsed = !collapsed
      paint()
    },
    onUpgrade: () => {
      analytics('match_score_upgrade_clicked')
      void openProCheckout({
        plan: 'monthly',
        source: 'match_score',
        atsSite: activeAts,
      })
    },
    onOpenProfile: () => {
      void chrome.runtime.sendMessage({ action: 'openPopup' })
    },
    onQuickYes: (skill: string) => {
      void answerYes(skill)
    },
    onQuickNo: (skill: string) => {
      void answerNo(skill)
    },
    onUndo: (skill: string) => {
      void undoSkillAdd(skill)
    },
  }
}

function paint() {
  if (!isTopFrame()) return
  let model: MatchScoreCardModel | null = null
  if (pending && !activeScore && !activeMissing) model = { kind: 'loading' }
  else if (activeScore) {
    model = { kind: 'scored', score: activeScore, collapsed, pending, undoSkill }
  } else if (activeMissing) model = { kind: 'insufficient' }
  else if (pending) model = { kind: 'loading' }
  if (!model) return
  renderMatchScoreCard(model, handlers())
}

function showModel(model: MatchScoreCardModel) {
  if (!isTopFrame()) return
  renderMatchScoreCard(model, handlers())
}

export function onMatchScoreRender(message: RenderMessage) {
  if (!isTopFrame() || userDisabled) return
  installProfileWatch()
  if (typeof message.seq === 'number') {
    if (message.seq < seenSeq) return
    seenSeq = message.seq
  }
  if (message.jobUrl && dismissedJob === message.jobUrl) return
  rememberContext(message)
  if (message.requested) {
    analytics('match_score_requested', { cached: false })
  }

  if (message.view === 'keep') {
    pending = false
    paint()
    return
  }
  if (message.view === 'hide') {
    pending = false
    activeScore = null
    activeMissing = false
    hideMatchScoreCard()
    if (message.reason && message.reason !== 'dismissed') {
      analytics('match_score_failed', { latency_ms: message.latencyMs, cached: false })
    }
    return
  }
  if (message.view === 'loading') {
    pending = true
    if (activeScore) paint()
    else {
      activeMissing = false
      showModel({ kind: 'loading' })
    }
    return
  }
  if (message.view === 'locked') {
    pending = false
    activeScore = null
    activeMissing = false
    analytics('match_score_locked_viewed', { cached: false })
    showModel({ kind: 'locked' })
    return
  }
  if (message.view === 'insufficient') {
    pending = false
    activeScore = null
    activeMissing = true
    collapsed = false
    analytics('match_score_shown', {
      latency_ms: message.latencyMs ?? 0,
      cached: message.cached === true,
    })
    showModel({ kind: 'insufficient' })
    return
  }
  if (message.view === 'scored' && message.score && message.score.status === 'scored') {
    pending = false
    activeMissing = false
    activeScore = message.score
    analytics('match_score_shown', {
      latency_ms: message.latencyMs ?? 0,
      cached: message.cached === true,
    })
    showModel({
      kind: 'scored',
      score: message.score,
      collapsed,
      pending: false,
      undoSkill,
    })
  }
}

async function fetchPosting(url: string): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchJobPosting', url })
    if (!response || response.ok !== true || typeof response.body !== 'string') return null
    return response.body
  } catch {
    return null
  }
}

function formReady(): boolean {
  return !!document.querySelector('form, #application-form, #application_form')
}

function whenFormReady(run: () => void) {
  formObserver?.disconnect()
  if (formReady()) {
    run()
    return
  }
  if (!document.body) return
  formObserver = new MutationObserver(() => {
    if (!formReady()) return
    formObserver?.disconnect()
    formObserver = null
    run()
  })
  formObserver.observe(document.body, { childList: true, subtree: true })
}

async function requestScore() {
  if (!activeJobUrl || !activeAts || !activeSource) return
  if (!(await readResumeMatchingEnabled())) return
  await chrome.runtime.sendMessage({
    action: 'matchScore',
    jobUrl: activeJobUrl,
    ats: activeAts,
    jdText: lastJd,
    jdSource: activeSource,
    rescore: true,
  })
}

function installProfileWatch() {
  if (profileWatchInstalled) return
  profileWatchInstalled = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.personalInfo) return
    if (suppressProfileWatch > 0) {
      suppressProfileWatch -= 1
      return
    }
    if (!activeScore || pending || !activeJobUrl || dismissedJob === activeJobUrl) return
    void requestScore()
  })
}

function releasePending() {
  pending = false
  paint()
}

async function answerYes(skill: string) {
  if (pending || !activeScore) return
  const answer = activeScore.suggestions.map(quickAnswerFor).find((item) => item?.skill === skill)
  if (!answer) return
  pending = true
  paint()
  analytics('match_score_quick_answer_yes')
  suppressProfileWatch += 1
  try {
    const added = await chrome.runtime.sendMessage({ action: 'matchScoreAddSkill', skill: answer.skill })
    if (!added?.ok) {
      suppressProfileWatch = Math.max(0, suppressProfileWatch - 1)
      releasePending()
      return
    }
    undoSkill = answer.skill
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = setTimeout(() => {
      undoSkill = null
      if (activeScore) paint()
    }, 5000)
    await requestScore()
  } catch {
    suppressProfileWatch = Math.max(0, suppressProfileWatch - 1)
    releasePending()
  }
}

async function answerNo(skill: string) {
  if (pending || !activeScore || !activeJobUrl) return
  pending = true
  paint()
  analytics('match_score_quick_answer_no')
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'matchScoreDecline',
      skill,
      jobUrl: activeJobUrl,
    })
    pending = false
    if (!result?.ok || !activeScore) {
      paint()
      return
    }
    activeScore = {
      ...activeScore,
      suggestions: activeScore.suggestions.filter((suggestion) => quickAnswerFor(suggestion)?.skill.toLowerCase() !== skill.toLowerCase()),
    }
    paint()
  } catch {
    releasePending()
  }
}

async function undoSkillAdd(skill: string) {
  if (pending || !activeJobUrl) return
  pending = true
  if (undoTimer) clearTimeout(undoTimer)
  undoSkill = null
  paint()
  analytics('match_score_quick_answer_undo')
  suppressProfileWatch += 1
  try {
    await chrome.runtime.sendMessage({ action: 'matchScoreRemoveSkill', skill })
    await chrome.runtime.sendMessage({ action: 'matchScoreUndoDecline', skill, jobUrl: activeJobUrl })
    await requestScore()
  } catch {
    suppressProfileWatch = Math.max(0, suppressProfileWatch - 1)
    releasePending()
  }
}

async function runOnce() {
  if (!matchScoreEnabled()) return
  // Read the popup switch on every run so a change applies without a reload.
  const userEnabled = await readResumeMatchingEnabled()
  userDisabled = !userEnabled
  if (!userEnabled) return
  const session = await getProfileSetupSession()
  if (session) return
  const completedAt = await getProfileSetupCompletedAt()
  if (!completedAt) return
  const ats = detectAts({ hostname: window.location.hostname, href: window.location.href, document })
  if (!ats || !isMatchAts(ats)) return
  const extraction = await extractJobDescription(
    ats,
    { href: window.location.href, hostname: window.location.hostname, document },
    fetchPosting,
  )
  const entitlement = await readEntitlement()
  const intent = matchScoreIntent({
    enabled: userEnabled,
    onboarding: false,
    extraction,
    isPro: entitlement.isPro,
  })
  if (intent === 'skip' || !extraction) return
  const dedupeKey = `${intent}:${extraction.jobUrl}`
  if (sent.has(dedupeKey)) return
  sent.add(dedupeKey)
  activeJobUrl = extraction.jobUrl
  activeAts = ats
  activeSource = extraction.source
  lastJd = extraction.text
  if (intent === 'locked') {
    await chrome.runtime.sendMessage({
      action: 'matchScoreRelay',
      view: 'locked',
      jobUrl: extraction.jobUrl,
      ats,
      jdSource: extraction.source,
    })
    return
  }
  await chrome.runtime.sendMessage({
    action: 'matchScore',
    jobUrl: extraction.jobUrl,
    ats,
    jdText: extraction.text,
    jdSource: extraction.source,
    rescore: false,
  })
}

function scoreCurrentPage() {
  void runOnce().catch(() => {
    // A scoring failure must not surface on the page or delay autofill.
  })
}

function resetCardForNavigation() {
  activeScore = null
  activeMissing = false
  pending = false
  collapsed = false
  undoSkill = null
  lastJd = ''
  sent.clear()
  if (undoTimer) clearTimeout(undoTimer)
  hideMatchScoreCard()
}

function installSettingWatch() {
  if (settingWatchInstalled) return
  settingWatchInstalled = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[RESUME_MATCHING_KEY]) return
    const enabled = resumeMatchingEnabled(changes[RESUME_MATCHING_KEY].newValue)
    userDisabled = !enabled
    if (enabled) {
      whenFormReady(scoreCurrentPage)
    } else {
      formObserver?.disconnect()
      formObserver = null
      resetCardForNavigation()
    }
  })
}

export function startMatchScore(): void {
  whenFormReady(scoreCurrentPage)
  installSettingWatch()
  if (urlWatchInstalled || !isTopFrame()) return
  urlWatchInstalled = true
  let href = window.location.href
  window.setInterval(() => {
    if (window.location.href === href) return
    href = window.location.href
    resetCardForNavigation()
    whenFormReady(scoreCurrentPage)
  }, 1000)
}
