import { detectAts, type AtsPageContext } from './ats.ts'

export type AutofillContractEvent = 'autofill_attempted' | 'autofill_succeeded' | 'autofill_failed'

/** Stable snake_case reasons for autofill_failed. Only set on failed events. */
export type AutofillFailureReason =
  | 'empty_profile'
  | 'no_fillable_fields'
  | 'no_matching_fields'
  | 'error'
  | 'page_unreachable'

export type AutofillContractProps = {
  ats: string
  time_to_first_fill_ms: number
  is_first_fill: boolean
  minutes_since_install: number
  failure_reason?: AutofillFailureReason
  /** HTTP status when the failure path was an HTTP error; omit/null when N/A. */
  http?: number | null
  status?: number | null
}

// time_to_first_fill_ms is the install → first successful fill duration once that
// success exists. Until then it is the elapsed time since install, and is_first_fill
// stays true so attempted/failed events before that success are still the first-fill path.
export function buildAutofillContractProps(input: {
  hostname: string
  href?: string | null
  document?: AtsPageContext['document']
  now: number
  installedAt: number
  firstFillAt: number | null
  recordSuccess: boolean
  failureReason?: AutofillFailureReason | null
  http?: number | null
  status?: number | null
}): { props: AutofillContractProps; firstFillAtToStore: number | null } {
  const isFirstFill = input.firstFillAt == null
  const recordedAt = input.recordSuccess && input.firstFillAt == null ? input.now : null
  const anchor = input.firstFillAt ?? recordedAt ?? input.now
  const elapsedMs = Math.max(0, input.now - input.installedAt)

  const props: AutofillContractProps = {
    ats:
      detectAts({
        hostname: input.hostname,
        href: input.href,
        document: input.document,
      }) ?? 'other',
    time_to_first_fill_ms: Math.max(0, anchor - input.installedAt),
    is_first_fill: isFirstFill,
    minutes_since_install: Math.round((elapsedMs / 60000) * 100) / 100,
  }

  if (input.failureReason) {
    props.failure_reason = input.failureReason
  }
  // Only attach http/status when a caller had a real HTTP failure — never invent them.
  if (input.http != null) props.http = input.http
  if (input.status != null) props.status = input.status

  return {
    props,
    firstFillAtToStore: recordedAt,
  }
}
