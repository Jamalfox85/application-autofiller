// Backend Pro AI routes reject free plans with HTTP 403 and error.code
// plan_required. The envelope may be either:
//   { success: false, error: { code: "plan_required", message } }
//   { error: { code: "plan_required", message } }
// `success: false` is required only when `success` is present.
export interface PlanRequiredBody {
  success?: false
  error: {
    code: 'plan_required'
    message?: string
  }
}

export function isPlanRequiredResponse(status: number, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== 'object') return false
  const record = body as { success?: unknown; error?: unknown }
  if ('success' in record && record.success !== false) return false
  if (!record.error || typeof record.error !== 'object') return false
  return (record.error as { code?: unknown }).code === 'plan_required'
}
