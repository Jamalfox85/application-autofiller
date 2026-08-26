// src/lib/api.ts
import { supabase } from './supabase'
import type { ParsedResumeData } from '../types'

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

  // Parse an uploaded resume into structured profile data, for onboarding new users who have
  // no personalInfo saved yet. Deliberately unauthenticated — there's no Supabase session to
  // send at this point in the flow. See the request/response contract in the comment below.
  //
  // Request:  POST /resume/parse
  //           multipart/form-data, field name "resume" — the raw PDF/DOC/DOCX file (<=10MB).
  // Response: 200 { success: true, data: ParsedResumeData }
  //           4xx/5xx or 200 { success: false, message: string } on failure (unsupported
  //           format, file too large, extraction/LLM failure, etc.) — `message` is shown to
  //           the user as-is, so keep it short and user-facing.
  async parseResume(file: File): Promise<ParsedResumeData> {
    const formData = new FormData()
    formData.append('resume', file)

    const res = await fetch(`${API_URL}/resume/parse`, {
      method: 'POST',
      body: formData,
    })

    const body = await res.json().catch(() => null)

    if (!res.ok || !body?.success) {
      throw new Error(
        body?.message || 'Failed to read that resume. Please try again or enter your info manually.',
      )
    }

    return body.data as ParsedResumeData
  },
}
