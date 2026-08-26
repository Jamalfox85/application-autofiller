// src/services/posthog.ts
const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string
const POSTHOG_API_HOST = import.meta.env.VITE_POSTHOG_API_HOST as string

export const captureEvent = async (eventName: string, properties?: Record<string, any>) => {
  const payload = {
    api_key: POSTHOG_API_KEY,
    event: eventName,
    properties: properties || {},
    distinct_id: 'extension-user', // Required
    timestamp: new Date().toISOString(),
  }

  console.log('PostHog payload:', payload)

  try {
    const response = await fetch('https://app.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    console.log('PostHog response:', text)

    if (!response.ok) {
      console.error('PostHog error:', response.status, text)
    }
  } catch (error) {
    console.error('PostHog capture error:', error)
  }
}

export const identifyUser = async (userId: string, properties?: Record<string, any>) => {
  const payload = {
    api_key: POSTHOG_API_KEY,
    event: '$identify',
    distinct_id: userId,
    properties: properties || {},
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
