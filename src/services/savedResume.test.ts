import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fileFromSavedResumePayload,
  isOwnerResumePath,
  readSavedResume,
  savedResumeMessage,
  type ResumeStorageClient,
} from './savedResume.ts'

const USER = 'ee362686-bd12-4e0b-bee8-d43c095a8840'
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

function client(overrides: Partial<ResumeStorageClient> = {}): ResumeStorageClient {
  return {
    async userId() {
      return USER
    },
    async profileResume() {
      return { fileName: 'Ada Lovelace.pdf', path: `${USER}/resume.pdf` }
    },
    async download() {
      return { bytes: PDF, mimeType: 'application/pdf' }
    },
    ...overrides,
  }
}

test('a saved resume path must stay inside that user folder', () => {
  assert.equal(isOwnerResumePath(USER, `${USER}/resume.pdf`), true)
  assert.equal(isOwnerResumePath(USER, `${USER}/Ada_Lovelace.pdf`), true)
  assert.equal(isOwnerResumePath(USER, `other-user/resume.pdf`), false)
  assert.equal(isOwnerResumePath(USER, `${USER}/../other/resume.pdf`), false)
  assert.equal(isOwnerResumePath(USER, `${USER}/nested/resume.pdf`), false)
  assert.equal(isOwnerResumePath('', `${USER}/resume.pdf`), false)
})

test('readSavedResume returns the uploaded file bytes and original name', async () => {
  const seen: string[] = []
  const saved = await readSavedResume(
    client({
      async download(path) {
        seen.push(path)
        return { bytes: PDF, mimeType: 'application/pdf' }
      },
    }),
  )
  assert.deepEqual(seen, [`${USER}/resume.pdf`])
  assert.equal(saved?.fileName, 'Ada Lovelace.pdf')
  assert.equal(saved?.mimeType, 'application/pdf')
  assert.deepEqual(saved?.bytes, PDF)

  const message = savedResumeMessage(saved)
  assert.equal(message.ok, true)
  if (!message.ok) return
  const file = fileFromSavedResumePayload(message)
  assert.equal(file?.name, 'Ada Lovelace.pdf')
  assert.equal(file?.type, 'application/pdf')
  assert.equal(file?.size, PDF.byteLength)
  assert.deepEqual(new Uint8Array(await file!.arrayBuffer()), PDF)
})

test('readSavedResume returns null without a session, path, or bytes', async () => {
  assert.equal(await readSavedResume(client({ async userId() { return null } })), null)
  assert.equal(
    await readSavedResume(client({ async profileResume() { return null } })),
    null,
  )
  assert.equal(
    await readSavedResume(
      client({
        async profileResume() {
          return { fileName: 'other.pdf', path: 'someone-else/resume.pdf' }
        },
      }),
    ),
    null,
  )
  assert.equal(
    await readSavedResume(client({ async download() { return { bytes: new Uint8Array(), mimeType: 'application/pdf' } } })),
    null,
  )
  assert.deepEqual(savedResumeMessage(null), { ok: false })
})
