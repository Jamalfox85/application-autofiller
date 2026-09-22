import { supabase } from '@/lib/supabase'
import { getUserIdOrNull } from '@/lib/sync/shared'
import { PENDING_PLAN_KEY } from './entitlementStore.ts'

export type ProfilePlan = 'free' | 'pro'

// Local purchase record only. The ExtensionPay worker writes the entitlement
// cache that the popup reads. PENDING_PLAN_KEY is the plan still waiting on
// the backend to persist `profiles.plan`.
//
// The database write-lock on `profiles.plan` is live. This function attempts
// a client UPDATE as best-effort and expects it to fail RLS (an error, or
// zero rows when PostgREST filters the update). That attempt is not a
// successful plan write: it never returns ok, and it never clears
// PENDING_PLAN_KEY. Ordinary profile saves omit `plan` (see profileToDbRows).
//
// TODO(backend): call the billing endpoint that writes `profiles.plan` from a
// verified ExtensionPay purchase once Backend publishes the path. Clear
// PENDING_PLAN_KEY only after that call succeeds. Do not add a client-side
// bypass that lets the extension set `plan` itself.
export async function writeProfilePlan(plan: ProfilePlan): Promise<{ ok: boolean; reason?: string }> {
  try {
    await chrome.storage.local.set({ [PENDING_PLAN_KEY]: plan })
  } catch (error) {
    console.error('[billing] pending plan cache failed', error)
  }

  try {
    const userId = await getUserIdOrNull()
    if (!userId) {
      return { ok: false, reason: 'signed_out' }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ plan, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('plan')

    if (error) {
      console.info('[billing] profiles.plan client update rejected (RLS write-lock expected)', error.message)
      return { ok: false, reason: 'rls_rejected' }
    }

    const confirmed = Array.isArray(data) && data.some((row) => row?.plan === plan)
    if (!confirmed) {
      console.info('[billing] profiles.plan client update changed 0 rows (RLS write-lock expected)')
      return { ok: false, reason: 'rls_rejected' }
    }

    // A returned row is still not the supported writer. Keep the pending key
    // until the backend billing endpoint persists the plan.
    console.info('[billing] profiles.plan client update returned a row; plan stays pending for the backend billing endpoint')
    return { ok: false, reason: 'pending_backend' }
  } catch (error) {
    console.info('[billing] profiles.plan client update rejected (RLS write-lock expected)', error)
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
