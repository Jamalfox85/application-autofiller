// The profile mirror stores resumeFileName only. The bytes live in the private
// Supabase storage bucket "resumes", at profiles.resume_file_path (for example
// "<user id>/resume.pdf"). This reads that object with the signed-in session.
// It does not upload, refresh, or write the profile.

export type SavedResumeFile = {
  name: string
  mimeType: string
  bytes: Uint8Array
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function supabaseAuthStorageKey(supabaseUrl: string): string | null {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    if (!ref) return null
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

// Object name inside the resumes bucket. Only the signed-in user's own folder,
// one path segment, so a stored path cannot point at another account's file.
export function resumeObjectPath(userId: string, resumeFilePath: string): string | null {
  if (!USER_ID.test(userId)) return null
  const path = resumeFilePath.trim().replace(/^\/+/, '')
  const prefix = `${userId}/`
  if (!path.startsWith(prefix)) return null
  const name = path.slice(prefix.length)
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null
  return path
}

export function parseStoredSession(
  raw: string | null,
  now = Date.now(),
): { accessToken: string; userId: string } | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const session = parsed as { access_token?: unknown; expires_at?: unknown; user?: { id?: unknown } }
  const accessToken = typeof session.access_token === 'string' ? session.access_token : ''
  const userId = typeof session.user?.id === 'string' ? session.user.id : ''
  if (!accessToken || !USER_ID.test(userId)) return null
  if (typeof session.expires_at === 'number' && session.expires_at * 1000 <= now) return null
  return { accessToken, userId }
}

export async function readSavedResume(options: {
  supabaseUrl: string
  anonKey: string
  readStorageItem: (key: string) => Promise<string | null>
  fetchImpl?: typeof fetch
  now?: number
}): Promise<SavedResumeFile | null> {
  const supabaseUrl = options.supabaseUrl.trim().replace(/\/$/, '')
  const anonKey = options.anonKey.trim()
  if (!supabaseUrl || !anonKey) return null

  const storageKey = supabaseAuthStorageKey(supabaseUrl)
  if (!storageKey) return null
  const session = parseStoredSession(await options.readStorageItem(storageKey), options.now)
  if (!session) return null

  const fetchImpl = options.fetchImpl ?? fetch
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${session.accessToken}`,
  }

  const profileUrl = new URL('/rest/v1/profiles', supabaseUrl)
  profileUrl.searchParams.set('id', `eq.${session.userId}`)
  profileUrl.searchParams.set('select', 'resume_file_path,resume_file_name')
  const profileRes = await fetchImpl(profileUrl, {
    headers: { ...headers, Accept: 'application/json' },
  })
  if (!profileRes.ok) return null

  const row = firstRow(await profileRes.json())
  const storedPath = typeof row?.resume_file_path === 'string' ? row.resume_file_path : ''
  const objectPath = resumeObjectPath(session.userId, storedPath)
  if (!objectPath) return null

  const name = fileNameFrom(row?.resume_file_name, objectPath)
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/')
  const fileRes = await fetchImpl(new URL(`/storage/v1/object/resumes/${encoded}`, supabaseUrl), {
    headers,
  })
  if (!fileRes.ok) return null
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  if (bytes.byteLength === 0) return null

  return {
    name,
    mimeType: mimeType(fileRes.headers.get('content-type'), name),
    bytes,
  }
}

export async function loadSavedResumeFromAccount(): Promise<SavedResumeFile | null> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return null
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return null
    return await readSavedResume({
      supabaseUrl,
      anonKey,
      readStorageItem: (key) =>
        new Promise((resolve) => {
          chrome.storage.local.get(key, (res) => {
            const value = res?.[key]
            resolve(typeof value === 'string' ? value : null)
          })
        }),
    })
  } catch {
    return null
  }
}

function firstRow(body: unknown): Record<string, unknown> | null {
  const row = Array.isArray(body) ? body[0] : body
  if (!row || typeof row !== 'object') return null
  return row as Record<string, unknown>
}

function fileNameFrom(resumeFileName: unknown, objectPath: string): string {
  const fallback = objectPath.split('/').pop() || 'resume'
  const raw = typeof resumeFileName === 'string' ? resumeFileName : ''
  const base = raw.replace(/[\u0000-\u001f]/g, '').trim().split(/[/\\]/).pop() || ''
  return base || fallback
}

function mimeType(header: string | null, name: string): string {
  const raw = (header || '').split(';')[0].trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream' && raw !== 'binary/octet-stream') return raw
  return mimeFromName(name)
}

function mimeFromName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.doc':
      return 'application/msword'
    case '.rtf':
      return 'application/rtf'
    case '.txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}
