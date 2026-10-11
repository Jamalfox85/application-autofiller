// Until billing has answered, the popup must not treat the account as free.
// A missing plan is loading, never a paywall and never a "Pro feature" label.

export const PLAN_PENDING_LABEL = 'Loading'

export type PlanIsPro = boolean | null

export function planPending(isPro: PlanIsPro): boolean {
  return isPro == null
}

export function proFeatureMeta(isPro: PlanIsPro, proText: string, freeText = 'Pro feature'): string {
  if (isPro == null) return PLAN_PENDING_LABEL
  return isPro ? proText : freeText
}

export function profilesRowMeta(isPro: PlanIsPro, profileCount: number, profileLabel: string): string {
  if (isPro == null) return PLAN_PENDING_LABEL
  if (isPro || profileCount > 1) return profileLabel
  return 'Pro feature'
}

export type ProfilesRowAction = 'wait' | 'open' | 'paywall'

export function profilesRowAction(isPro: PlanIsPro, profileCount: number): ProfilesRowAction {
  if (isPro == null) return 'wait'
  if (isPro || profileCount > 1) return 'open'
  return 'paywall'
}

export type NewProfileAction = 'wait' | 'paywall' | 'create' | 'limit'

export function newProfileAction(isPro: PlanIsPro, atLimit: boolean): NewProfileAction {
  if (isPro == null) return 'wait'
  if (!isPro) return 'paywall'
  if (atLimit) return 'limit'
  return 'create'
}

export function rosterCountLabel(loaded: boolean, count: number, max: number): string {
  if (!loaded) return PLAN_PENDING_LABEL
  return `${count} of ${max}`
}
