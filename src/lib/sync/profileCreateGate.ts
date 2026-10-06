// create_profile reads profiles.plan, not the ExtPay entitlement cache. A paid install can
// still be plan=free until POST /billing/plan/refresh writes pro. Create and duplicate both
// go through this helper so that refresh happens immediately before the RPC. A free account
// (refresh stays free, or refresh cannot run) still surfaces pro_required for the paywall.

export type ServerPlanSnapshot = { ok: true; plan: 'pro' | 'free' } | { ok: false }

export async function createProfileAfterPlanRefresh<T>(input: {
  refreshPlan: () => Promise<ServerPlanSnapshot>
  createProfile: () => Promise<T>
  proRequired: (error: unknown) => boolean
}): Promise<T> {
  await input.refreshPlan()
  try {
    return await input.createProfile()
  } catch (error) {
    if (!input.proRequired(error)) throw error
    // The open-time refresh can fail or land after the click. Retry once only when the
    // server now reports pro, so a free account is not asked twice.
    const again = await input.refreshPlan()
    if (again.ok && again.plan === 'pro') return input.createProfile()
    throw error
  }
}
