// Mixpanel contract events for a fill. Content scripts and the popup both call
// trackFillContract so autofill_attempted / _succeeded / _failed carry the same props.
// Mixpanel goes through the HTTP helper (safe in content scripts); PostHog uses captureEvent.
import { captureEvent } from './posthog'
import { trackEvent } from './mixpanelHttp'
import {
  buildAutofillContractProps,
  type AutofillContractEvent,
  type AutofillContractProps,
} from '../utils/fillContract'

const FIRST_FILL_KEY = 'firstAutofillSucceededAt'
const INSTALL_FALLBACK_KEY = 'extensionInstalledAt'

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

export async function fillContractProps(
  hostname: string,
  event: AutofillContractEvent,
): Promise<AutofillContractProps> {
  const installedAt = await getInstalledAtMs()
  const now = Date.now()
  const stored = await chrome.storage.local.get(FIRST_FILL_KEY)
  const existing =
    typeof stored[FIRST_FILL_KEY] === 'number' ? (stored[FIRST_FILL_KEY] as number) : null

  const built = buildAutofillContractProps({
    hostname,
    now,
    installedAt,
    firstFillAt: existing,
    recordSuccess: event === 'autofill_succeeded',
  })

  if (built.firstFillAtToStore != null) {
    await chrome.storage.local.set({ [FIRST_FILL_KEY]: built.firstFillAtToStore })
  }

  return built.props
}

export async function trackFillContract(event: AutofillContractEvent, hostname: string) {
  const properties = await fillContractProps(hostname, event)
  void trackEvent(event, properties)
  void captureEvent(event, properties)
}
