// Popup resume upload persists the file on the signed-in account.
//
// The parse API may store an object under the user's folder and still leave
// `profiles` empty. Autofill reads the resume back from `resume_file_name` +
// `resume_file_path` and the private `resumes` bucket, so the extension has to
// write both itself. This runs in the service worker: the popup is destroyed
// when it loses focus and must not be the thing that commits the save.

const PDF = 'resume.pdf'
const DOCX = 'resume.docx'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface SavedResume {
  userId: string
  fileName: string
  storagePath: string
}

export function canonicalResumeObjectName(fileName: string, fileType: string): string | null {
  const name = fileName.trim().toLowerCase()
  const type = fileType.trim().toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') return PDF
  if (name.endsWith('.docx') || type === DOCX_MIME) return DOCX
  return null
}

export function userIdFromAccessToken(token: string): string | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const json = JSON.parse(atob(padded + pad)) as { sub?: unknown }
    return typeof json.sub === 'string' && /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null
  } catch {
    return null
  }
}

export function resumeStoragePath(userId: string, objectName: string): string {
  return `${userId}/${objectName}`
}

// Columns the upload is allowed to write. `plan` is intentionally absent.
export function savedResumeProfileRow(
  saved: SavedResume,
  updatedAt: string,
): Record<string, unknown> {
  return {
    id: saved.userId,
    resume_file_name: saved.fileName,
    resume_file_path: saved.storagePath,
    synced_from_extension: true,
    updated_at: updatedAt,
  }
}

export async function saveResumeToAccount(options: {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  fileName: string
  fileType: string
  bytes: Uint8Array
  fetchImpl?: typeof fetch
  now?: () => Date
}): Promise<SavedResume> {
  const fetchImpl = options.fetchImpl ?? fetch
  const userId = userIdFromAccessToken(options.accessToken)
  if (!userId) {
    throw new Error('Please sign in again before uploading your resume.')
  }

  const objectName = canonicalResumeObjectName(options.fileName, options.fileType)
  if (!objectName) {
    throw new Error('Please upload a PDF or DOCX file.')
  }

  const storagePath = resumeStoragePath(userId, objectName)
  const mime = objectName === PDF ? 'application/pdf' : DOCX_MIME
  const base = options.supabaseUrl.replace(/\/$/, '')
  const headers = {
    Authorization: `Bearer ${options.accessToken}`,
    apikey: options.anonKey,
  }

  const uploaded = await fetchImpl(`${base}/storage/v1/object/resumes/${storagePath}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': mime,
      'x-upsert': 'true',
      'cache-control': 'no-cache',
    },
    body: options.bytes,
  })
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => '')
    console.error('[resume-upload] storage save failed', uploaded.status, detail.slice(0, 500))
    throw new Error("Couldn't save your resume. Please try again.")
  }

  const saved: SavedResume = {
    userId,
    fileName: options.fileName,
    storagePath,
  }
  const row = savedResumeProfileRow(saved, (options.now ?? (() => new Date()))().toISOString())
  const profile = await fetchImpl(`${base}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!profile.ok) {
    const detail = await profile.text().catch(() => '')
    console.error('[resume-upload] profile save failed', profile.status, detail.slice(0, 500))
    if (profile.status === 401) {
      throw new Error('Please sign in again before uploading your resume.')
    }
    throw new Error("Couldn't save your resume to your account. Please try again.")
  }

  const writtenPath = await readSavedResumePath(fetchImpl, base, headers, userId)
  if (writtenPath !== storagePath) {
    throw new Error("Couldn't save your resume to your account. Please try again.")
  }

  return saved
}

// Same columns later autofill reads: resume_file_path and resume_file_name.
async function readSavedResumePath(
  fetchImpl: typeof fetch,
  base: string,
  headers: { Authorization: string; apikey: string },
  userId: string,
): Promise<string | null> {
  const read = await fetchImpl(
    `${base}/rest/v1/profiles?id=eq.${userId}&select=resume_file_path,resume_file_name`,
    { headers },
  )
  if (!read.ok) return null
  const body = (await read.json().catch(() => null)) as { resume_file_path?: string }[] | null
  const path = body?.[0]?.resume_file_path
  return typeof path === 'string' && path ? path : null
}
