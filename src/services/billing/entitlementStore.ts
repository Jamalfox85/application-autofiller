export const ENTITLEMENT_KEY = 'billingEntitlement'
export const CHECKOUT_KEY = 'billingCheckout'
export const USER_ID_KEY = 'billingUserId'
export const PENDING_PLAN_KEY = 'pendingProfilePlan'

export interface EntitlementCache {
  isPro: boolean
  plan: 'monthly' | 'annual' | null
  updatedAt: number
}

export async function readEntitlement(): Promise<EntitlementCache> {
  try {
    const data = await chrome.storage.local.get(ENTITLEMENT_KEY)
    const stored = data[ENTITLEMENT_KEY] as Partial<EntitlementCache> | undefined
    if (!stored || typeof stored.isPro !== 'boolean') {
      return { isPro: false, plan: null, updatedAt: 0 }
    }
    return {
      isPro: stored.isPro,
      plan: stored.plan === 'monthly' || stored.plan === 'annual' ? stored.plan : null,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
    }
  } catch {
    return { isPro: false, plan: null, updatedAt: 0 }
  }
}

export async function writeEntitlement(cache: EntitlementCache): Promise<void> {
  await chrome.storage.local.set({ [ENTITLEMENT_KEY]: cache })
}

export interface CheckoutSession {
  plan: 'monthly' | 'annual' | null
  source: 'soft_gate' | 'hard_cap' | 'resume_ai' | 'multi_profile'
  fillCount: number | null
  atsSite: string | null
  openedAt: number
  completed: boolean
}

export async function readCheckoutSession(): Promise<CheckoutSession | null> {
  const data = await chrome.storage.local.get(CHECKOUT_KEY)
  const stored = data[CHECKOUT_KEY] as CheckoutSession | undefined
  if (!stored || typeof stored.openedAt !== 'number') return null
  return stored
}

export async function writeCheckoutSession(session: CheckoutSession): Promise<void> {
  await chrome.storage.local.set({ [CHECKOUT_KEY]: session })
}

export async function clearCheckoutSession(): Promise<void> {
  await chrome.storage.local.remove(CHECKOUT_KEY)
}
