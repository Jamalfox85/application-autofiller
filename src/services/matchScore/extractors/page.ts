export interface ExtractElement {
  textContent: string | null
  getAttribute(name: string): string | null
}

export interface ExtractDocument {
  querySelector(selector: string): ExtractElement | null
}

export interface ExtractPage {
  href: string
  hostname: string
  document?: ExtractDocument | null
}

export interface JobExtraction {
  text: string
  source: 'dom' | 'fetched'
  jobUrl: string
}

export type PostingFetcher = (url: string) => Promise<string | null>

export function safeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function pageUrl(href: string): URL | null {
  try {
    return new URL(href)
  } catch {
    return null
  }
}
