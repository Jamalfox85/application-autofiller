// Wraps the mixpanel-browser SDK for the popup. Content scripts use
// src/services/mixpanelHttp.ts instead — the SDK's published bundle statically includes its
// session-recording stack, which Chromium's content-script loader rejects outright (see that
// file for why). The background service worker has neither `window` nor `document`, so
// mixpanel-browser would throw there regardless — it re-implements the same raw HTTP API
// inline in background.js.
//
// distinct_id is sourced from chrome.storage.local (extension-scoped, shared across every
// context and every site) rather than left to the SDK's own persistence. mixpanel-browser
// falls back to page localStorage/cookies, which are scoped per origin — in a content
// script that means every site the user visits would get its own distinct_id, splitting
// one person's activity into a different Mixpanel user per site.
import mixpanel from 'mixpanel-browser'
import { getOrCreateDistinctId } from './mixpanelIdentity'
import {
  MIXPANEL_JS_API_HOST,
  MIXPANEL_TOKEN,
  extensionSuperProperties,
  stripEmpty,
} from './mixpanelConfig'

let readyPromise: Promise<void> | null = null

function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      mixpanel.init(MIXPANEL_TOKEN, {
        api_host: MIXPANEL_JS_API_HOST,
        autocapture: false,
        track_pageview: false,
        persistence: 'localStorage',
        debug: import.meta.env.DEV,
      })
      const distinctId = await getOrCreateDistinctId()
      mixpanel.identify(distinctId)
      mixpanel.register(extensionSuperProperties())
    })()
  }
  return readyPromise
}

export function initMixpanel() {
  void ensureReady()
}

export async function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  await ensureReady()
  mixpanel.track(eventName, stripEmpty(properties))
}
