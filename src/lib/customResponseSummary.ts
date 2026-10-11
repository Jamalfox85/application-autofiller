export function customResponseSummary(count: number | null | undefined): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (n > 0) return `${n} response${n === 1 ? '' : 's'}`
  return 'Tailor responses for specific questions'
}

export function customResponsesDone(count: number | null | undefined): boolean {
  return typeof count === 'number' && Number.isFinite(count) && count > 0
}
