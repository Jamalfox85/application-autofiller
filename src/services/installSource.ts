// Reads the install-source record written by the service worker and, on our own
// landing host, asks the worker to fill any fields that were still empty.
import {
  INSTALL_SOURCE_STORAGE_KEY,
  attributionFromLanding,
  installSourceProperties,
  referrerOrigin,
  type InstallSourceRecord,
} from './installAttribution'

export async function getInstallSourceProperties(): Promise<Record<string, string>> {
  try {
    const data = await chrome.storage.local.get(INSTALL_SOURCE_STORAGE_KEY)
    return installSourceProperties(data[INSTALL_SOURCE_STORAGE_KEY] as InstallSourceRecord | undefined)
  } catch {
    return {}
  }
}

export async function captureLandingAttribution(pageUrl: string, referrer: string): Promise<void> {
  const fields = attributionFromLanding(pageUrl, referrer)
  if (Object.keys(fields).length === 0) return

  // Origin only — the raw referrer query never leaves the page.
  const origin = referrerOrigin(referrer)
  try {
    await chrome.runtime.sendMessage({
      action: 'captureInstallAttribution',
      referrer: origin,
    })
  } catch {
    // Attribution is best-effort. Tracking still runs without it.
  }
}
