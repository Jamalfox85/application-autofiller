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
// posts to the same HTTP API. It isn't bundled by Vite; copy-files emits
// mixpanelConfig.js so the worker can share build_channel and the first-fill rule.
import { getOrCreateDistinctId } from './mixpanelIdentity.ts'
import {
  MIXPANEL_HTTP_TRACK_URL,
  MIXPANEL_TOKEN,
  extensionSuperProperties,
  finalizeTrackedProperties,
} from './mixpanelConfig.ts'
import { getInstallSourceProperties } from './installSource.ts'

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  options?: { keepalive?: boolean },
) {
  const superProps = await extensionSuperProperties()
  const clean = finalizeTrackedProperties(properties, superProps.build_channel)
  // The service worker must not relay to itself: Chrome does not deliver
  // runtime.sendMessage back to the sender, so the promise would never settle.
  const inServiceWorker = typeof document === 'undefined'
  if (!inServiceWorker) {
    try {
      // Page connect-src (Greenhouse does not allow api.mixpanel.com) can block a
      // fetch made from the content script, and an embedded apply iframe's request
      // does not show on the parent page's network log. The service worker is
      // outside the page CSP, so the contract events still leave the browser.
      const response = await chrome.runtime.sendMessage({
        action: 'trackMixpanel',
        eventName,
        properties: clean,
      })
      if (response?.ok) return
    } catch (error) {
      console.error('Mixpanel relay failed:', error)
    }
  }

  try {
    const distinctId = await getOrCreateDistinctId()
    const installProps = await getInstallSourceProperties()
    const eventProps = finalizeTrackedProperties(
      { ...superProps, ...installProps, ...clean },
      superProps.build_channel,
    )

    await fetch(MIXPANEL_HTTP_TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      keepalive: options?.keepalive,
      body: JSON.stringify([
        {
          event: eventName,
          properties: {
            token: MIXPANEL_TOKEN,
            distinct_id: distinctId,
            time: Math.floor(Date.now() / 1000),
            $insert_id: crypto.randomUUID(),
            ...eventProps,
          },
        },
      ]),
    })
  } catch (error) {
    console.error('Mixpanel track error:', error)
  }
}
