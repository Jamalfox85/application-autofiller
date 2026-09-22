import { atsFromHostname } from './ats.ts'

export type AutofillContractEvent = 'autofill_attempted' | 'autofill_succeeded' | 'autofill_failed'

export type AutofillContractProps = {
  ats: string
  time_to_first_fill_ms: number
  is_first_fill: boolean
  minutes_since_install: number
}

// time_to_first_fill_ms is the install → first successful fill duration once that
// success exists. Until then it is the elapsed time since install, and is_first_fill
// stays true so attempted/failed events before that success are still the first-fill path.
export function buildAutofillContractProps(input: {
  hostname: string
  now: number
  installedAt: number
  firstFillAt: number | null
  recordSuccess: boolean
}): { props: AutofillContractProps; firstFillAtToStore: number | null } {
  const isFirstFill = input.firstFillAt == null
  const recordedAt = input.recordSuccess && input.firstFillAt == null ? input.now : null
  const anchor = input.firstFillAt ?? recordedAt ?? input.now
  const elapsedMs = Math.max(0, input.now - input.installedAt)

  return {
    props: {
      ats: atsFromHostname(input.hostname) ?? 'other',
      time_to_first_fill_ms: Math.max(0, anchor - input.installedAt),
      is_first_fill: isFirstFill,
      minutes_since_install: Math.round((elapsedMs / 60000) * 100) / 100,
    },
    firstFillAtToStore: recordedAt,
  }
}
