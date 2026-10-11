// Conversion-locked paywall copy. Do not paraphrase. Apostrophes and dashes are
// the typographic characters from the locked strings.
// softContinueFreeLabel inserts how many free fills are left this week. At the
// soft gate (fill 10 of 25) that number is 15.

export function softContinueFreeLabel(fillsLeft: number): string {
  const left = Number.isFinite(fillsLeft) ? Math.max(0, Math.trunc(fillsLeft)) : 0
  return `Continue free (${left} fills left this week)`
}

export const PAYWALL_COPY = {
  soft: {
    title: 'You\u2019ve used 10 of 25 free fills this week',
    body: 'Go Pro for unlimited autofills.',
    primary: 'Upgrade to Pro \u2014 $5.99/mo',
    tertiary: 'See annual \u2014 $49/yr',
  },
  hard: {
    title: 'You\u2019ve hit your free fill limit',
    body: 'Unlock unlimited fills, score matching, and up to 5 profiles with Pro.',
    // Visible primary CTA. Clicking it starts the monthly checkout.
    primary: 'Get Pro \u2014 $5.99/mo',
    // Annual purchase. Not a continue-filling action.
    annual: 'Get Pro \u2014 $49/yr',
  },
  resumeAi: {
    title: 'Score matching is a Pro feature.',
    cta: 'Upgrade to Pro',
  },
  multiProfile: {
    title: 'Up to 5 profiles, each with its own resume, are a Pro feature.',
    cta: 'Upgrade to Pro',
  },
  // Shown when a free account taps a profile that was locked when Pro lapsed.
  lockedProfile: {
    title: 'Resubscribe to use this profile again.',
    cta: 'Upgrade to Pro',
  },
} as const
