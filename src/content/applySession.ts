// One apply_session event per ATS page visit: success as soon as a fill sticks,
// otherwise fail (a fill was attempted) or abandon (the page was left first).
// Fired to Mixpanel and PostHog with the same property names the rest of the
// content script already uses (job_site) plus ats / host / outcome.
import { captureEvent } from '../services/posthog'
import { trackEvent } from '../services/mixpanelHttp'
import { getOrCreateDistinctId } from '../services/mixpanelIdentity'
import { atsFromHostname } from '../utils/ats'
import { outcomeOnLeave, type ApplySessionOutcome } from '../utils/applySessionOutcome'

type ApplySession = {
  id: string
  ats: string
  host: string
  startedAt: number
  outcome: ApplySessionOutcome | null
  sawFailure: boolean
  attempts: number
  filledCount: number
  attemptedCount: number
  triggerSource?: string
}

let session: ApplySession | null = null
let leaveHooked = false

export function beginApplySession(hostname: string): boolean {
  hookLeave()
  const ats = atsFromHostname(hostname)
  if (!ats) return false
  if (session) return true

  session = {
    id: crypto.randomUUID(),
    ats,
    host: hostname,
    startedAt: Date.now(),
    outcome: null,
    sawFailure: false,
    attempts: 0,
    filledCount: 0,
    attemptedCount: 0,
  }
  // Warm the Mixpanel distinct id so a pagehide fail/abandon can post immediately.
  void getOrCreateDistinctId()
  return true
}

export function noteApplyAttempt(details: {
  success: boolean
  filledCount?: number
  attemptedCount?: number
  triggerSource?: string
}) {
  if (!beginApplySession(window.location.hostname) || !session || session.outcome) {
    return
  }

  session.attempts += 1
  session.filledCount = details.filledCount ?? 0
  session.attemptedCount = details.attemptedCount ?? 0
  if (details.triggerSource) session.triggerSource = details.triggerSource

  if (details.success) {
    session.outcome = 'success'
    emit('success')
    return
  }

  session.sawFailure = true
}

export function finalizeApplySessionOnLeave() {
  if (!session) return
  const outcome = outcomeOnLeave({ settled: session.outcome, sawFailure: session.sawFailure })
  if (!outcome) return
  session.outcome = outcome
  emit(outcome, true)
}

function hookLeave() {
  if (leaveHooked || typeof window === 'undefined') return
  leaveHooked = true
  window.addEventListener('pagehide', () => {
    finalizeApplySessionOnLeave()
  })
}

function emit(outcome: ApplySessionOutcome, keepalive = false) {
  if (!session) return
  const properties = {
    ats: session.ats,
    host: session.host,
    job_site: session.host,
    outcome,
    session_id: session.id,
    duration_seconds: (Date.now() - session.startedAt) / 1000,
    attempts: session.attempts,
    filled_count: session.filledCount,
    fields_attempted_count: session.attemptedCount,
    trigger_source: session.triggerSource,
  }
  void trackEvent('apply_session', properties, { keepalive })
  void captureEvent('apply_session', properties, { keepalive })
}
