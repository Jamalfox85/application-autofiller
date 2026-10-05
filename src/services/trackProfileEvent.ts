import { trackEvent } from './mixpanelHttp'
import type { ProfileEventName } from './profileEvents'

export async function trackProfileEvent(
  event: ProfileEventName,
  properties: Record<string, unknown>,
): Promise<void> {
  try {
    await trackEvent(event, properties)
  } catch (error) {
    console.error('[profiles] analytics failed', event, error)
  }
}
