// src/lib/api.ts
import { supabase } from './supabase'

const API_URL = 'https://autofiller-api-dev.up.railway.app'

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export const api = {
  // Get current usage and plan
  async getUsage() {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/usage`, { headers })
    if (!res.ok) throw new Error('Failed to fetch usage')
    return res.json()
  },

  // Increment usage when user performs an action
  async incrementUsage(field: 'applications' | 'custom_responses') {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/usage/increment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ field }),
    })
    if (!res.ok) throw new Error('Failed to increment usage')
    return res.json()
  },

  // Start checkout for upgrade
  async createCheckout(priceId: string) {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/checkout/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ priceId }),
    })
    if (!res.ok) throw new Error('Failed to create checkout')
    return res.json()
  },

  // Open billing portal for managing subscription
  async openBillingPortal() {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/billing/portal`, {
      method: 'POST',
      headers,
    })
    if (!res.ok) throw new Error('Failed to open portal')
    return res.json()
  },
}
