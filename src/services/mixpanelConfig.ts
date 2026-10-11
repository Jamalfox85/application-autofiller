// Shared Mixpanel constants and helpers. Popup uses the mixpanel-browser SDK
// (src/services/mixpanel.ts); content scripts and the service worker post to the
// HTTP Track API instead (see mixpanelHttp.ts / background.js).
import { extensionBuildChannel, type BuildChannelName } from './buildChannel.ts'

export const MIXPANEL_TOKEN = '631d1b855c22a921118ebbe7bdcafedb'
export const MIXPANEL_HTTP_TRACK_URL = 'https://api.mixpanel.com/track'
export const MIXPANEL_JS_API_HOST = 'https://api-js.mixpanel.com'

export function stripEmpty(properties?: Record<string, unknown>) {
  if (!properties) return undefined
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

export type ExtensionSuperProperties = {
  platform: 'chrome_extension'
  app_version: string
  build_channel: BuildChannelName
}

export async function extensionSuperProperties(): Promise<ExtensionSuperProperties> {
  return {
    platform: 'chrome_extension',
    app_version: chrome.runtime.getManifest().version,
    build_channel: await extensionBuildChannel(),
  }
}

function scrubTrackedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubTrackedValue)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    // Application Account passwords must never leave the extension for analytics.
    if (/^(?:password|accountpassword|account_password)$/i.test(key)) continue
    out[key] = scrubTrackedValue(inner)
  }
  return out
}

// Event payload for Mixpanel. build_channel is always the
// build stamp (never null, and never a caller-supplied value). time_to_first_fill_ms
// is attached only while is_first_fill is true. Password fields are dropped at
// every level so a caller cannot attach a portal password by accident.
export function finalizeTrackedProperties(
  properties: Record<string, unknown> | undefined,
  buildChannel: BuildChannelName,
): Record<string, unknown> {
  const next = (scrubTrackedValue(properties ?? {}) ?? {}) as Record<string, unknown>
  if (next.is_first_fill !== true) delete next.time_to_first_fill_ms
  delete next.build_channel
  return { ...(stripEmpty(next) ?? {}), build_channel: buildChannel }
}
