// Lightweight Mixpanel tracking for the content-script context, posting to the HTTP Track
// API directly instead of using the mixpanel-browser SDK. The SDK's published bundle
// statically includes its session-recording stack (rrweb-snapshot, which bundles postcss)
// even though nothing here uses recording — and that bundled postcss source contains a
// literal U+FFFE character, which Chromium's content-script loader rejects outright
// ("isn't UTF-8 encoded"), because it explicitly disallows Unicode noncharacters even though
// they're byte-valid UTF-8. Content scripts can't code-split their way around it either
// (Manifest V3 content scripts can't load ES module chunks), so the only fix is not pulling
// the SDK in at all.
//
// See src/services/mixpanel.ts for the SDK-based path used by the popup, and
// src/services/mixpanelIdentity.ts for the shared distinct_id this reads. background.js
// mirrors this same HTTP approach inline (it isn't bundled by Vite, so it can't import
// either module).
import { getOrCreateDistinctId } from './mixpanelIdentity'
import {
  MIXPANEL_HTTP_TRACK_URL,
  MIXPANEL_TOKEN,
  extensionSuperProperties,
  stripEmpty,
} from './mixpanelConfig'

export async function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  try {
    const distinctId = await getOrCreateDistinctId()

    await fetch(MIXPANEL_HTTP_TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify([
        {
          event: eventName,
          properties: {
            token: MIXPANEL_TOKEN,
            distinct_id: distinctId,
            time: Math.floor(Date.now() / 1000),
            $insert_id: crypto.randomUUID(),
            ...extensionSuperProperties(),
            ...stripEmpty(properties),
          },
        },
      ]),
    })
  } catch (error) {
    console.error('Mixpanel track error:', error)
  }
}
