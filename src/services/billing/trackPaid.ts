import { getOrCreateDistinctId } from '../mixpanelIdentity'
import { getInstallSourceProperties } from '../installSource'
import { trackEvent } from '../mixpanelHttp'
import {
  buildChannelFromInstallSource,
  type PaidEventContext,
} from './paidEvents.ts'
import { USER_ID_KEY } from './entitlementStore.ts'

export async function paidEventContext(extra?: Partial<PaidEventContext>): Promise<PaidEventContext> {
  let distinctId: string | null = null
  let userId: string | null = extra?.userId ?? null
  let extensionVersion: string | null = null
  let installSource: string | undefined

  try {
    distinctId = await getOrCreateDistinctId()
  } catch {
    distinctId = null
  }

  try {
    const data = await chrome.storage.local.get(USER_ID_KEY)
    if (!userId && typeof data[USER_ID_KEY] === 'string') userId = data[USER_ID_KEY] as string
  } catch {
    // Identity stamps are best-effort.
  }

  try {
    extensionVersion = chrome.runtime.getManifest().version
  } catch {
    extensionVersion = null
  }

  try {
    const install = await getInstallSourceProperties()
    installSource = install.install_source
  } catch {
    installSource = undefined
  }

  return {
    distinctId,
    userId,
    extensionVersion,
    buildChannel: buildChannelFromInstallSource(installSource),
    atsSite: extra?.atsSite,
    fillCount: extra?.fillCount,
  }
}

export async function trackPaid(eventName: string, properties: Record<string, unknown>): Promise<void> {
  await trackEvent(eventName, properties)
}
