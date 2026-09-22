// Backend 2.0: Pro AI routes reject free plans with HTTP 403 and this body.
export interface PlanRequiredBody {
  success: false
  error: {
    code: 'plan_required'
    message: string
  }
}

export function isPlanRequiredResponse(status: number, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== 'object') return false
  const record = body as { success?: unknown; error?: unknown }
  if (record.success !== false || !record.error || typeof record.error !== 'object') return false
  return (record.error as { code?: unknown }).code === 'plan_required'
}
