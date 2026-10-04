// Reads the resume already stored for the signed-in user. Runs in the service
// worker because an Ashby page's connect-src does not allow the content script
// to fetch Supabase. Does not upload, parse, or write profiles.resume_file_path.

import { chromeLocalStorage } from '../lib/chromeLocalStorage.ts'
import {
  MAX_SAVED_RESUME_BYTES,
  bytesToBase64,
  savedResumeDisplayName,
  savedResumeMimeType,
  savedResumeObjectPath,
  savedResumeOwnedBy,
  supabaseAuthStorageKey,
} from './savedResumeFile.ts'

export type SavedResumeDownload =
  | { ok: true; fileName: string; mimeType: string; bytesBase64: string }
  | { ok: false }

type StoredSession = {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  token_type?: string
  user?: { id?: string }
}

export async function readSavedResumeForFill(): Promise<SavedResumeDownload> {
  try {
    const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
    const storageKey = supabaseAuthStorageKey(url)
    if (!url || !anonKey || !storageKey) return { ok: false }

    const session = await readSession(storageKey)
    const userId = session?.user?.id
    if (!session || typeof userId !== 'string' || !userId) return { ok: false }

    const accessToken = await freshAccessToken(url, anonKey, storageKey, session)
    if (!accessToken) return { ok: false }

    const profile = await fetchResumeRow(url, anonKey, accessToken, userId)
    if (!profile) return { ok: false }
    const objectPath = savedResumeObjectPath(profile.path)
    if (!objectPath || !savedResumeOwnedBy(objectPath, userId)) return { ok: false }

    const bytes = await downloadResume(url, anonKey, accessToken, objectPath)
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_SAVED_RESUME_BYTES) {
      return { ok: false }
    }

    const fileName = savedResumeDisplayName(profile.fileName, objectPath)
    return {
      ok: true,
      fileName,
      mimeType: savedResumeMimeType(fileName),
      bytesBase64: bytesToBase64(bytes),
    }
  } catch (error) {
    console.error('[resume-file] could not read the saved resume', error)
    return { ok: false }
  }
}

async function readSession(storageKey: string): Promise<StoredSession | null> {
  const raw = await chromeLocalStorage.getItem(storageKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

async function freshAccessToken(
  url: string,
  anonKey: string,
  storageKey: string,
  session: StoredSession,
): Promise<string | null> {
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0
  if (session.access_token && expiresAtMs - Date.now() > 60_000) return session.access_token
  if (!session.refresh_token) return session.access_token || null

  const endpoint = new URL('/auth/v1/token', url)
  endpoint.searchParams.set('grant_type', 'refresh_token')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  if (!res.ok) {
    return session.access_token && expiresAtMs > Date.now() ? session.access_token : null
  }

  const body = (await res.json()) as StoredSession
  const next: StoredSession = {
    ...session,
    access_token: body.access_token || session.access_token,
    refresh_token: body.refresh_token || session.refresh_token,
    expires_in: body.expires_in ?? session.expires_in,
    expires_at:
      body.expires_at ||
      (body.expires_in ? Math.floor(Date.now() / 1000) + Number(body.expires_in) : session.expires_at),
    token_type: body.token_type || session.token_type || 'bearer',
    user: body.user || session.user,
  }
  await chromeLocalStorage.setItem(storageKey, JSON.stringify(next))
  return next.access_token || null
}

async function fetchResumeRow(
  url: string,
  anonKey: string,
  accessToken: string,
  userId: string,
): Promise<{ path: string | null; fileName: string | null } | null> {
  const endpoint = new URL('/rest/v1/profiles', url)
  endpoint.searchParams.set('id', `eq.${userId}`)
  endpoint.searchParams.set('select', 'resume_file_path,resume_file_name')
  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ resume_file_path?: unknown; resume_file_name?: unknown }>
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return null
  return {
    path: typeof row.resume_file_path === 'string' ? row.resume_file_path : null,
    fileName: typeof row.resume_file_name === 'string' ? row.resume_file_name : null,
  }
}

async function downloadResume(
  url: string,
  anonKey: string,
  accessToken: string,
  objectPath: string,
): Promise<Uint8Array | null> {
  const slash = objectPath.indexOf('/')
  const folder = objectPath.slice(0, slash)
  const name = objectPath.slice(slash + 1)
  const endpoint = new URL(
    `/storage/v1/object/resumes/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
    url,
  )
  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) return null
  return new Uint8Array(await res.arrayBuffer())
}
