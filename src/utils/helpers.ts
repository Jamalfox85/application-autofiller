export function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}
