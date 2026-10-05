// Conversion-locked paywall copy. Do not paraphrase. Apostrophes and dashes are
// the typographic characters from the locked strings.

export const PAYWALL_COPY = {
  soft: {
    title: 'You\u2019ve used 10 of 25 free fills this week',
    body: 'Go Pro for unlimited autofills, plus Application Match Score and up to 5 profiles.',
    primary: 'Upgrade to Pro \u2014 $5.99/mo',
    secondary: 'Continue free (15 fills left)',
    tertiary: 'See annual \u2014 $49/yr',
  },
  hard: {
    title: 'You\u2019ve hit your free fill limit',
    body: 'Unlock unlimited fills, Application Match Score, and up to 5 profiles with Pro.',
    // Visible primary CTA. Clicking it starts the default (monthly) checkout.
    primary: 'Get Pro \u2014 $5.99/mo or $49/yr',
    // Annual purchase. Not a continue-filling action.
    annual: 'Get Pro \u2014 $49/yr',
  },
  resumeAi: {
    title: 'Application Match Score is a Pro feature.',
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
