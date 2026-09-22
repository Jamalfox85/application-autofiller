export type ApplySessionOutcome = 'success' | 'fail' | 'abandon'

// Success is emitted as soon as a fill sticks. Fail and abandon wait until the
// page is actually left, so a later retry in the same visit can still succeed.
export function outcomeOnLeave(state: {
  settled: ApplySessionOutcome | null
  sawFailure: boolean
}): ApplySessionOutcome | null {
  if (state.settled) return null
  return state.sawFailure ? 'fail' : 'abandon'
}
