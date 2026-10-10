// Links a resume shows only as link text ("GitHub", "LinkedIn") live in the file as annotations
// or relationships, not in the extracted text, so the parse API never sees them. Read them from
// the file itself before upload. Best effort: any failure just returns no links.

const URI_RE = /\/URI\s*\(((?:\\.|[^)\\])*)\)/g

function latin1(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return out
}

async function inflate(data: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function collectUris(text: string, into: Set<string>) {
  URI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URI_RE.exec(text))) {
    const uri = m[1].replace(/\\([()\\])/g, '$1').trim()
    if (/^https?:\/\//i.test(uri)) into.add(uri)
  }
}

export async function pdfLinks(bytes: Uint8Array): Promise<string[]> {
  const found = new Set<string>()
  const text = latin1(bytes)
  collectUris(text, found)
  // Annotation dictionaries are often packed in compressed object streams.
  const streamRe = /stream\r?\n/g
  let m: RegExpExecArray | null
  let tried = 0
  while ((m = streamRe.exec(text)) && tried < 3000) {
    const start = m.index + m[0].length
    const endMarker = text.indexOf('endstream', start)
    if (endMarker < 0) break
    let end = endMarker
    // The EOL before `endstream` is not part of the data and trips the inflater.
    while (end > start && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--
    const head = text.slice(Math.max(0, m.index - 300), m.index)
    streamRe.lastIndex = endMarker
    if (!head.includes('FlateDecode')) continue
    tried++
    try {
      const inflated = await inflate(bytes.subarray(start, end), 'deflate')
      collectUris(latin1(inflated), found)
    } catch {
      // Not a valid deflate stream (image, etc.).
    }
  }
  return [...found]
}

export async function docxLinks(bytes: Uint8Array): Promise<string[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const found: string[] = []
  const decoder = new TextDecoder()
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/^word\/_rels\/[^/]+\.rels$/.test(name)) continue
    const lhName = view.getUint16(localOffset + 26, true)
    const lhExtra = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + lhName + lhExtra
    const raw = bytes.subarray(dataStart, dataStart + compSize)
    try {
      const xml = decoder.decode(method === 0 ? raw : await inflate(raw, 'deflate-raw'))
      for (const rel of xml.matchAll(/Target="(https?:\/\/[^"]+)"/gi)) found.push(rel[1].replace(/&amp;/g, '&'))
    } catch {
      // Unreadable part: skip.
    }
  }
  return found
}

export interface EmbeddedLinks {
  github?: string
  linkedin?: string
}

export function pickProfileLinks(urls: string[]): EmbeddedLinks {
  const out: EmbeddedLinks = {}
  // A profile link (github.com/user) beats a repo link (github.com/user/repo).
  const github = urls.filter((u) => /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9-]+\/?$/i.test(u))
  const anyGithub = urls.filter((u) => /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9-]+/i.test(u))
  out.github = github[0] ?? anyGithub[0]
  out.linkedin = urls.find((u) => /^https?:\/\/([a-z]+\.)?linkedin\.com\/in\//i.test(u))
  if (!out.github) delete out.github
  if (!out.linkedin) delete out.linkedin
  return out
}

export async function extractEmbeddedLinks(bytes: Uint8Array, fileName: string): Promise<EmbeddedLinks> {
  try {
    const lower = fileName.toLowerCase()
    const urls = lower.endsWith('.docx') ? await docxLinks(bytes) : lower.endsWith('.pdf') ? await pdfLinks(bytes) : []
    return pickProfileLinks(urls)
  } catch {
    return {}
  }
}
