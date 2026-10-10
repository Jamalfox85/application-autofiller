// src/services/posthog.ts
import { getInstallSourceProperties } from './installSource'
import { extensionBuildChannel } from './buildChannel'
import { finalizeTrackedProperties } from './mixpanelConfig'

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string
const POSTHOG_API_HOST = import.meta.env.VITE_POSTHOG_API_HOST as string

export const captureEvent = async (
  eventName: string,
  properties?: Record<string, any>,
  options?: { keepalive?: boolean },
) => {
  const [installProps, channel] = await Promise.all([
    getInstallSourceProperties(),
    extensionBuildChannel(),
  ])
  const payload = {
    api_key: POSTHOG_API_KEY,
    event: eventName,
    properties: finalizeTrackedProperties({ ...installProps, ...(properties || {}) }, channel),
    distinct_id: 'extension-user', // Required
    timestamp: new Date().toISOString(),
  }

  try {
    const response = await fetch('https://app.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: options?.keepalive,
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    if (!response.ok) {
      console.error('PostHog error:', response.status, text)
    }
  } catch (error) {
    console.error('PostHog capture error:', error)
  }
}

export const identifyUser = async (userId: string, properties?: Record<string, any>) => {
  const channel = await extensionBuildChannel()
  const payload = {
    api_key: POSTHOG_API_KEY,
    event: '$identify',
    distinct_id: userId,
    properties: finalizeTrackedProperties(properties, channel),
    timestamp: new Date().toISOString(),
  }

  try {
    await fetch('https://app.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('PostHog identify error:', error)
  }
}
