import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync, deflateRawSync } from 'node:zlib'
import { docxLinks, extractEmbeddedLinks, pdfLinks, pickProfileLinks } from './resumeLinks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]))

test('PDF: plain and compressed link annotations are found', async () => {
  const compressed = deflateSync(enc('<< /Type /Annot /A << /S /URI /URI (https://github.com/jamalfox85) >> >>'))
  const pdf = concat(
    enc('%PDF-1.5\n1 0 obj << /A << /S /URI /URI (https://www.linkedin.com/in/jamal) >> >> endobj\n2 0 obj << /Filter /FlateDecode /Length 1 >>\nstream\n'),
    compressed,
    enc('\nendstream endobj\n'),
  )
  const links = await pdfLinks(pdf)
  assert.ok(links.includes('https://github.com/jamalfox85'))
  assert.deepEqual(await extractEmbeddedLinks(pdf, 'cv.pdf'), {
    github: 'https://github.com/jamalfox85',
    linkedin: 'https://www.linkedin.com/in/jamal',
  })
})

function zipOne(name: string, content: string): Uint8Array {
  const data = deflateRawSync(enc(content))
  const nameB = enc(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameB.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameB.length, 28)
  central.writeUInt32LE(0, 42)
  const cdStart = local.length + nameB.length + data.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(46 + nameB.length, 12)
  eocd.writeUInt32LE(cdStart, 16)
  return concat(local, nameB, data, central, nameB, eocd)
}

test('DOCX: hyperlink relationships are found', async () => {
  const rels = '<Relationships><Relationship Id="rId5" Type="x/hyperlink" Target="https://github.com/jamalfox85" TargetMode="External"/></Relationships>'
  const docx = zipOne('word/_rels/document.xml.rels', rels)
  assert.deepEqual(await docxLinks(docx), ['https://github.com/jamalfox85'])
})

test('a profile link wins over a repo link; unreadable files give no links', async () => {
  assert.equal(
    pickProfileLinks(['https://github.com/jamalfox85/repo', 'https://github.com/jamalfox85']).github,
    'https://github.com/jamalfox85',
  )
  assert.deepEqual(await extractEmbeddedLinks(enc('not a pdf'), 'x.pdf'), {})
})

test('the service worker merges embedded links into the parse only where the parse has none', async () => {
  const { readFileSync } = await import('node:fs')
  const bg = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  assert.match(bg, /embeddedLinks\.github && !contact\.github/)
  const hook = readFileSync(new URL('../composables/useResumeUpload.ts', import.meta.url), 'utf8')
  assert.match(hook, /embeddedLinks,/)
})
