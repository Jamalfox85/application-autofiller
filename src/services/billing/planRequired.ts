// Pro AI routes reject free plans with HTTP 403 and error code plan_required.
// Accept either envelope, and a nested error.code:
//   { success: false, error: { code: "plan_required" } }
//   { error: { code: "plan_required" } }
//   { error: { error: { code: "plan_required" } } }
// `success: false` is required only when `success` is present.
export interface PlanRequiredBody {
  success?: false
  error: {
    code: 'plan_required'
    message?: string
  }
}

function hasPlanRequiredCode(value: unknown, depth: number): boolean {
  if (!value || typeof value !== 'object' || depth > 3) return false
  const record = value as { code?: unknown; error?: unknown }
  if (record.code === 'plan_required') return true
  return hasPlanRequiredCode(record.error, depth + 1)
}

export function isPlanRequiredResponse(status: number, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== 'object') return false
  const record = body as { success?: unknown; code?: unknown; error?: unknown }
  if ('success' in record && record.success !== false) return false
  if (record.code === 'plan_required') return true
  return hasPlanRequiredCode(record.error, 0)
}
