// Mixpanel contract events for a fill. Content scripts and the popup both call
// trackFillContract so autofill_attempted / _succeeded / _failed carry the same props.
// Mixpanel goes through the HTTP helper (safe in content scripts); PostHog uses captureEvent.
import { captureEvent } from './posthog'
import { trackEvent } from './mixpanelHttp'
import {
  buildAutofillContractProps,
  type AutofillContractEvent,
  type AutofillContractProps,
  type AutofillFailureReason,
} from '../utils/fillContract'
import type { AtsPageContext } from '../utils/ats'

const FIRST_FILL_KEY = 'firstAutofillSucceededAt'
const INSTALL_FALLBACK_KEY = 'extensionInstalledAt'

export type TrackFillContractContext = {
  hostname: string
  href?: string | null
  document?: AtsPageContext['document']
  failureReason?: AutofillFailureReason | null
  http?: number | null
  status?: number | null
}

async function getInstalledAtMs(): Promise<number> {
  const data = await chrome.storage.local.get(['stats', INSTALL_FALLBACK_KEY])
  const installDate = data.stats?.installDate
  const parsed = typeof installDate === 'string' ? Date.parse(installDate) : NaN
  if (!Number.isNaN(parsed)) return parsed

  if (typeof data[INSTALL_FALLBACK_KEY] === 'number') return data[INSTALL_FALLBACK_KEY]

  const now = Date.now()
  await chrome.storage.local.set({ [INSTALL_FALLBACK_KEY]: now })
  return now
}

function normalizeContext(
  hostnameOrContext: string | TrackFillContractContext,
): TrackFillContractContext {
  if (typeof hostnameOrContext === 'string') {
    return { hostname: hostnameOrContext }
  }
  return hostnameOrContext
}

export async function fillContractProps(
  hostnameOrContext: string | TrackFillContractContext,
  event: AutofillContractEvent,
): Promise<AutofillContractProps> {
  const context = normalizeContext(hostnameOrContext)
  const installedAt = await getInstalledAtMs()
  const now = Date.now()
  const stored = await chrome.storage.local.get(FIRST_FILL_KEY)
  const existing =
    typeof stored[FIRST_FILL_KEY] === 'number' ? (stored[FIRST_FILL_KEY] as number) : null

  const built = buildAutofillContractProps({
    hostname: context.hostname,
    href: context.href,
    document: context.document,
    now,
    installedAt,
    firstFillAt: existing,
    recordSuccess: event === 'autofill_succeeded',
    failureReason: event === 'autofill_failed' ? context.failureReason : null,
    http: event === 'autofill_failed' ? context.http : null,
    status: event === 'autofill_failed' ? context.status : null,
  })

  if (built.firstFillAtToStore != null) {
    await chrome.storage.local.set({ [FIRST_FILL_KEY]: built.firstFillAtToStore })
  }

  return built.props
}

export async function trackFillContract(
  event: AutofillContractEvent,
  hostnameOrContext: string | TrackFillContractContext,
) {
  const properties = await fillContractProps(hostnameOrContext, event)
  void trackEvent(event, properties)
  void captureEvent(event, properties)
}
