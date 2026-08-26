// Shared Mixpanel constants and helpers. Popup uses the mixpanel-browser SDK
// (src/services/mixpanel.ts); content scripts and the service worker post to the
// HTTP Track API instead (see mixpanelHttp.ts / background.js).
export const MIXPANEL_TOKEN = '631d1b855c22a921118ebbe7bdcafedb'
export const MIXPANEL_HTTP_TRACK_URL = 'https://api.mixpanel.com/track'
export const MIXPANEL_JS_API_HOST = 'https://api-js.mixpanel.com'

export function stripEmpty(properties?: Record<string, unknown>) {
  if (!properties) return undefined
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

export function extensionSuperProperties(): Record<string, string> {
  return {
    platform: 'chrome_extension',
    app_version: chrome.runtime.getManifest().version,
  }
}
