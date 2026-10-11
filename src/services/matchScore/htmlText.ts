import { JD_TEXT_MAX } from './types.ts'

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeHtml(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return NAMED[body] ?? whole
  })
}

// Block tags become line breaks. Spaces and tabs collapse, but blank lines in the
// posting stay. The score API accepts either shape.
function normalizeJobText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function htmlToText(input: string): string {
  const decoded = decodeHtml(input)
  const broken = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|section|article|ul|ol|blockquote|header|footer|table|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return normalizeJobText(broken)
}

export function capJdText(input: string): string {
  const collapsed = normalizeJobText(input)
  if (collapsed.length <= JD_TEXT_MAX) return collapsed
  return collapsed.slice(0, JD_TEXT_MAX).trimEnd()
}

export function elementJobText(el: { textContent: string | null; innerHTML?: string } | null | undefined): string {
  if (!el) return ''
  if (typeof el.innerHTML === 'string' && el.innerHTML.trim()) return htmlToText(el.innerHTML)
  return capJdText(el.textContent ?? '')
}
