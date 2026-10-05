// Mixpanel events for multiple profiles (FE-10). Sent through the existing trackMixpanel
// relay (src/services/mixpanelHttp.ts -> background.js) by ./trackProfileEvent.ts. Profile
// names are never sent. Pure so node:test can load it.
export const PROFILE_EVENT = {
  created: 'profile_created',
  switched: 'profile_switched',
  renamed: 'profile_renamed',
  deleted: 'profile_deleted',
  lockedViewed: 'profile_locked_viewed',
  paywallViewed: 'multi_profile_paywall_viewed',
} as const

export type ProfileEventName = (typeof PROFILE_EVENT)[keyof typeof PROFILE_EVENT]
export type ProfileCreateSource = 'copy' | 'resume' | 'blank'

export function profileCreatedProps(input: {
  source: ProfileCreateSource
  profileCount: number
  resumeCopied?: boolean | null
}) {
  return {
    source: input.source,
    profile_count: input.profileCount,
    ...(input.source === 'copy' && input.resumeCopied != null ? { resume_copied: input.resumeCopied } : {}),
  }
}

export function profileCountProps(profileCount: number, extra: Record<string, unknown> = {}) {
  return { profile_count: profileCount, ...extra }
}
