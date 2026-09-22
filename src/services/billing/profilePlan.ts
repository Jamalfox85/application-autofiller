import { supabase } from '@/lib/supabase'
import { getUserIdOrNull } from '@/lib/sync/shared'
import { PENDING_PLAN_KEY } from './entitlementStore.ts'

export type ProfilePlan = 'free' | 'pro'

// Writes only `profiles.plan` after ExtensionPay says the user paid.
// Profile saves go through profileToDbRows, which omits `plan`, so editing a
// name cannot downgrade a Pro row.
//
// The database write-lock on this column is not live yet. This update is the
// contract the backend will read once ENFORCE_PLAN_GATE is turned on. It is not
// forge-proof: a signed-in client can still change its own row until that lock
// ships. Keep writing `pro` on purchase anyway.
export async function writeProfilePlan(plan: ProfilePlan): Promise<{ ok: boolean; reason?: string }> {
  try {
    const userId = await getUserIdOrNull()
    if (!userId) {
      await chrome.storage.local.set({ [PENDING_PLAN_KEY]: plan })
      return { ok: false, reason: 'signed_out' }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ plan, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[billing] profiles.plan update failed', error)
      await chrome.storage.local.set({ [PENDING_PLAN_KEY]: plan })
      return { ok: false, reason: error.message }
    }

    await chrome.storage.local.remove(PENDING_PLAN_KEY)
    return { ok: true }
  } catch (error) {
    console.error('[billing] profiles.plan update failed', error)
    try {
      await chrome.storage.local.set({ [PENDING_PLAN_KEY]: plan })
    } catch {
      // Storage itself failed — nothing else to do.
    }
    return { ok: false, reason: error instanceof Error ? error.message : 'update_failed' }
  }
}

export async function flushPendingProfilePlan(): Promise<void> {
  let pending: unknown
  try {
    const data = await chrome.storage.local.get(PENDING_PLAN_KEY)
    pending = data[PENDING_PLAN_KEY]
  } catch {
    return
  }
  if (pending !== 'pro' && pending !== 'free') return
  await writeProfilePlan(pending)
}
