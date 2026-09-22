// Conversion-locked paywall copy. Do not paraphrase. Apostrophes and dashes are
// the typographic characters from the locked strings.

export const PAYWALL_COPY = {
  soft: {
    title: 'You\u2019ve used 10 of 25 free fills this month',
    body: 'Go Pro for unlimited autofills \u2014 plus resume AI tailor, ATS score, and multi-profile.',
    primary: 'Upgrade to Pro \u2014 $5.99/mo',
    secondary: 'Continue free (15 fills left)',
    tertiary: 'See annual \u2014 $49/yr',
  },
  hard: {
    title: 'You\u2019ve hit your free fill limit',
    body: 'Unlock unlimited fills, resume AI tailor + ATS score, and multi-profile with Pro.',
    // Visible primary CTA. Clicking it starts the default (monthly) checkout.
    primary: 'Get Pro \u2014 $5.99/mo or $49/yr',
    // Annual purchase. Not a continue-filling action.
    annual: 'Get Pro \u2014 $49/yr',
  },
  resumeAi: {
    title: 'Resume tailor + ATS score is a Pro feature.',
    cta: 'Upgrade to Pro',
  },
  multiProfile: {
    title: 'Multiple profiles are a Pro feature.',
    cta: 'Upgrade to Pro',
  },
} as const
