export interface JobExtraction {
  text: string
  source: 'dom' | 'fetched'
  jobUrl: string
}

export function matchScoreIntent(input: {
  enabled: boolean
  onboarding: boolean
  extraction: JobExtraction | null
  isPro: boolean
}): 'skip' | 'locked' | 'score' {
  if (!input.enabled || input.onboarding || !input.extraction?.text) return 'skip'
  if (!input.isPro) return 'locked'
  return 'score'
}
