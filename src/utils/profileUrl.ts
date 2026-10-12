// Profile links we build ourselves (a handle, "github.com/you") use https.
// A full URL that already has a scheme is returned unchanged: that is what the
// person typed, including an explicit http:// on a site they host.

const CONSTRUCTED_PROFILE_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'linkedin.com',
  'www.linkedin.com',
])

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

export function normalizeProfileUrl(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''
  if (hasScheme(trimmed)) return trimmed
  return `https://${trimmed.replace(/^\/+/, '')}`
}

// LinkedIn's own address is www.linkedin.com, and some application forms only
// accept that form. linkedin.com, http, and country hosts (uk.linkedin.com,
// which LinkedIn redirects to www) are written as https://www.linkedin.com/...;
// every other site is left as entered.
export function linkedinProfileUrl(value: string | null | undefined): string {
  const url = normalizeProfileUrl(value)
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host !== 'linkedin.com' && !/^[a-z]{2,3}\.linkedin\.com$/.test(host)) return url
    parsed.protocol = 'https:'
    parsed.hostname = 'www.linkedin.com'
    return parsed.href
  } catch {
    return url
  }
}

// The Links dialog shows LinkedIn behind fixed https://www. text, so the box
// holds the rest ("linkedin.com/in/you") and there is no www. to delete. A
// pasted full link loses its scheme and www. into that prefix, and the saved
// value always matches what the prefix and box show together.
export const LINKEDIN_PREFIX = 'https://www.'

function stripLinkedinPrefix(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '')
}

export function linkedinBoxText(saved: string | null | undefined): string {
  return stripLinkedinPrefix(linkedinProfileUrl(saved))
}

export function linkedinFromBox(value: string | null | undefined): string {
  const bare = stripLinkedinPrefix(value ?? '')
  if (!bare) return ''
  if (/^([a-z]{2,3}\.)?linkedin\.com(\/|$)/i.test(bare)) return linkedinProfileUrl(bare)
  return `${LINKEDIN_PREFIX}${bare}`
}

// Hosted application URL fields. Scheme-less values get https. http on the
// profile hosts we construct (github.com, linkedin.com) is rewritten to https.
// Any other full URL is left exactly as entered.
export function leverProfileUrl(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''
  const constructed = normalizeProfileUrl(trimmed)
  if (!hasScheme(trimmed)) return constructed
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' && CONSTRUCTED_PROFILE_HOSTS.has(url.hostname.toLowerCase())) {
      url.protocol = 'https:'
      return url.href
    }
  } catch {
    return trimmed
  }
  return trimmed
}
