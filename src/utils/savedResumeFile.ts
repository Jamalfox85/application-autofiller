// The profile mirror stores a resume filename. The bytes live in two places:
//   1. chrome.storage.local["savedResumeFile"] — written by the service worker when
//      an upload succeeds (background.js handleResumeUpload).
//   2. The private Supabase Storage bucket `resumes`, at profiles.resume_file_path
//      (`{userId}/{object}`). That path is what a signed-in user who already uploaded
//      still has after this browser has no local copy.
// Jobvite reads this module. Other ATS adapters do not.

import { isSupabaseAuthStorageKey } from '../lib/googleAuth.ts'
import type { PersonalInfo } from '../types/index.ts'

export const SAVED_RESUME_STORAGE_KEY = 'savedResumeFile'
const RESUME_BUCKET = 'resumes'

export type SavedResumeCache = {
  userId?: string | null
  fileName: string
  fileType: string
  bytesBase64: string
  storagePath?: string | null
  updatedAt: number
}

export type ResolvedResume = {
  name: string
  type: string
  bytes: Uint8Array
}

export type StoredAuthSession = {
  storageKey: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  raw: Record<string, unknown>
}

type FetchBytesResult = {
  ok: boolean
  status: number
  bytes: Uint8Array
  contentType: string | null
}

type FetchJsonResult = {
  ok: boolean
  status: number
  json: unknown
}

export type ResumeByteSource = {
  readCache(): Promise<SavedResumeCache | null>
  writeCache(record: SavedResumeCache): Promise<void>
  readSession(storageKey: string | null): Promise<StoredAuthSession | null>
  writeSession(storageKey: string, session: Record<string, unknown>): Promise<void>
  fetchBytes(url: string, headers: Record<string, string>): Promise<FetchBytesResult>
  fetchJson(
    url: string,
    headers: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<FetchJsonResult>
}

export type ResumeStorageConfig = {
  supabaseUrl: string
  anonKey: string
  now?: number
}

export function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function userIdFromAccessToken(token: string): string {
  const part = token.split('.')[1]
  if (!part) return ''
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const json = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof json.sub === 'string' ? json.sub : ''
  } catch {
    return ''
  }
}

export function mimeForResume(fileName: string, fileType?: string | null): string {
  const declared = (fileType || '').split(';')[0].trim()
  if (declared && declared !== 'application/octet-stream') return declared
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (ext === '.doc') return 'application/msword'
  return declared || 'application/octet-stream'
}

export function authStorageKeyForUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname
    const ref = host.split('.')[0]
    if (!ref) return null
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

export function sessionNeedsRefresh(expiresAtSec: number, nowMs: number): boolean {
  if (!expiresAtSec) return true
  return expiresAtSec * 1000 - nowMs < 60_000
}

export function parseStoredSession(storageKey: string, value: unknown): StoredAuthSession | null {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const accessToken = typeof record.access_token === 'string' ? record.access_token : ''
  if (!accessToken) return null
  const refreshToken = typeof record.refresh_token === 'string' ? record.refresh_token : ''
  const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : 0
  const user = record.user
  const userIdFromUser =
    user && typeof user === 'object' && typeof (user as { id?: unknown }).id === 'string'
      ? (user as { id: string }).id
      : ''
  return {
    storageKey,
    accessToken,
    refreshToken,
    expiresAt,
    userId: userIdFromUser || userIdFromAccessToken(accessToken),
    raw: record,
  }
}

export function mergeRefreshedSession(
  existing: Record<string, unknown>,
  refreshed: Record<string, unknown>,
  nowMs: number,
): Record<string, unknown> {
  const expiresIn = typeof refreshed.expires_in === 'number' ? refreshed.expires_in : 3600
  const expiresAt =
    typeof refreshed.expires_at === 'number' ? refreshed.expires_at : Math.floor(nowMs / 1000) + expiresIn
  return {
    ...existing,
    ...refreshed,
    expires_at: expiresAt,
    user: refreshed.user ?? existing.user,
  }
}

export function normalizeStoragePath(value: string | null | undefined): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const marker = '/object/resumes/'
  const idx = trimmed.indexOf(marker)
  const path = idx === -1 ? trimmed : trimmed.slice(idx + marker.length)
  return path
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

export function resumeStorageObjectUrl(supabaseUrl: string, objectPath: string): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const encoded = normalizeStoragePath(objectPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/storage/v1/object/${RESUME_BUCKET}/${encoded}`
}

export function cacheIsUsable(
  cache: SavedResumeCache | null | undefined,
  wanted: { fileName: string; storagePath?: string; userId?: string },
): boolean {
  if (!cache?.bytesBase64 || !cache.fileName) return false
  if (cache.fileName !== wanted.fileName) return false
  if (wanted.userId && cache.userId && cache.userId !== wanted.userId) return false
  const wantedPath = normalizeStoragePath(wanted.storagePath)
  const cachedPath = normalizeStoragePath(cache.storagePath)
  if (wantedPath && cachedPath && wantedPath !== cachedPath) return false
  return true
}

export function normalizeSavedResumeCache(value: unknown): SavedResumeCache | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<SavedResumeCache>
  if (typeof record.fileName !== 'string' || typeof record.bytesBase64 !== 'string') return null
  if (!record.fileName || !record.bytesBase64) return null
  return {
    userId: typeof record.userId === 'string' ? record.userId : null,
    fileName: record.fileName,
    fileType: typeof record.fileType === 'string' ? record.fileType : 'application/octet-stream',
    bytesBase64: record.bytesBase64,
    storagePath: typeof record.storagePath === 'string' ? record.storagePath : null,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
  }
}

function authHeaders(session: StoredAuthSession, anonKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    apikey: anonKey,
  }
}

async function refreshSession(
  source: ResumeByteSource,
  session: StoredAuthSession,
  config: ResumeStorageConfig,
  nowMs: number,
): Promise<StoredAuthSession | null> {
  if (!session.refreshToken || !config.supabaseUrl || !config.anonKey) return null
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`
  const result = await source.fetchJson(url, { apikey: config.anonKey }, { refresh_token: session.refreshToken })
  if (!result.ok || !result.json || typeof result.json !== 'object') return null
  const refreshed = result.json as Record<string, unknown>
  if (typeof refreshed.access_token !== 'string' || !refreshed.access_token) return null
  const merged = mergeRefreshedSession(session.raw, refreshed, nowMs)
  await source.writeSession(session.storageKey, merged)
  return parseStoredSession(session.storageKey, merged)
}

async function usableSession(
  source: ResumeByteSource,
  config: ResumeStorageConfig,
  nowMs: number,
): Promise<StoredAuthSession | null> {
  if (!config.supabaseUrl) return null
  const session = await source.readSession(authStorageKeyForUrl(config.supabaseUrl))
  if (!session) return null
  if (!sessionNeedsRefresh(session.expiresAt, nowMs)) return session
  const refreshed = await refreshSession(source, session, config, nowMs)
  if (refreshed) return refreshed
  if (session.expiresAt && session.expiresAt * 1000 > nowMs) return session
  return null
}

async function fetchResumePath(
  source: ResumeByteSource,
  session: StoredAuthSession,
  config: ResumeStorageConfig,
): Promise<string> {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}&select=resume_file_path`
  const result = await source.fetchJson(url, {
    ...authHeaders(session, config.anonKey),
    Accept: 'application/json',
  })
  if (!result.ok || !Array.isArray(result.json) || !result.json[0]) return ''
  const path = (result.json[0] as { resume_file_path?: unknown }).resume_file_path
  return typeof path === 'string' ? path.trim() : ''
}

async function downloadObject(
  source: ResumeByteSource,
  session: StoredAuthSession,
  config: ResumeStorageConfig,
  objectPath: string,
  nowMs: number,
): Promise<{ session: StoredAuthSession; bytes: Uint8Array; contentType: string | null } | null> {
  const url = resumeStorageObjectUrl(config.supabaseUrl, objectPath)
  let current = session
  let result = await source.fetchBytes(url, authHeaders(current, config.anonKey))
  if (result.status === 401) {
    const refreshed = await refreshSession(source, current, config, nowMs)
    if (!refreshed) return null
    current = refreshed
    result = await source.fetchBytes(url, authHeaders(current, config.anonKey))
  }
  if (!result.ok || result.bytes.byteLength === 0) return null
  return { session: current, bytes: result.bytes, contentType: result.contentType }
}

export async function resolveSavedResume(
  info: { resumeFileName?: string | null; resumeFilePath?: string | null },
  source: ResumeByteSource,
  config: ResumeStorageConfig,
): Promise<ResolvedResume | null> {
  const fileName = (info.resumeFileName || '').trim()
  if (!fileName) return null

  const now = config.now ?? Date.now()
  const session = await usableSession(source, config, now)
  const cache = await source.readCache()
  const profilePath = (info.resumeFilePath || '').trim()

  if (
    cache &&
    cacheIsUsable(cache, {
      fileName,
      storagePath: profilePath,
      userId: session?.userId || '',
    })
  ) {
    try {
      const bytes = bytesFromBase64(cache.bytesBase64)
      if (bytes.byteLength > 0) {
        return { name: fileName, type: mimeForResume(fileName, cache.fileType), bytes }
      }
    } catch {
      // Corrupt cache. Fall through to the storage object.
    }
  }

  if (!session || !config.supabaseUrl || !config.anonKey) return null

  const storagePath = profilePath || (await fetchResumePath(source, session, config))
  if (!storagePath) return null

  const downloaded = await downloadObject(source, session, config, storagePath, now)
  if (!downloaded) return null

  const type = mimeForResume(fileName, downloaded.contentType)
  try {
    await source.writeCache({
      userId: downloaded.session.userId,
      fileName,
      fileType: type,
      bytesBase64: bytesToBase64(downloaded.bytes),
      storagePath,
      updatedAt: now,
    })
  } catch {
    // The file can still be attached this pass when local quota is full.
  }

  return { name: fileName, type, bytes: downloaded.bytes }
}

function resumeStorageConfig(): ResumeStorageConfig {
  const env = import.meta.env
  return {
    supabaseUrl: env?.VITE_SUPABASE_URL || '',
    anonKey: env?.VITE_SUPABASE_ANON_KEY || '',
  }
}

function chromeResumeByteSource(): ResumeByteSource {
  return {
    async readCache() {
      const data = await chrome.storage.local.get(SAVED_RESUME_STORAGE_KEY)
      return normalizeSavedResumeCache(data[SAVED_RESUME_STORAGE_KEY])
    },
    async writeCache(record) {
      await chrome.storage.local.set({ [SAVED_RESUME_STORAGE_KEY]: record })
    },
    async readSession(storageKey) {
      if (storageKey) {
        const data = await chrome.storage.local.get(storageKey)
        return parseStoredSession(storageKey, data[storageKey])
      }
      const all = await chrome.storage.local.get(null)
      for (const [key, value] of Object.entries(all)) {
        if (!isSupabaseAuthStorageKey(key)) continue
        const parsed = parseStoredSession(key, value)
        if (parsed) return parsed
      }
      return null
    },
    async writeSession(storageKey, session) {
      await chrome.storage.local.set({ [storageKey]: JSON.stringify(session) })
    },
    async fetchBytes(url, headers) {
      const res = await fetch(url, { headers })
      return {
        ok: res.ok,
        status: res.status,
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('content-type'),
      }
    },
    async fetchJson(url, headers, body) {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) }
    },
  }
}

export async function loadResumeFileForJobvite(info: PersonalInfo): Promise<File | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
  const saved = await resolveSavedResume(
    { resumeFileName: info.resumeFileName, resumeFilePath: info.resumeFilePath },
    chromeResumeByteSource(),
    resumeStorageConfig(),
  )
  if (!saved) return null
  const copy = new Uint8Array(saved.bytes.byteLength)
  copy.set(saved.bytes)
  return new File([copy], saved.name, { type: saved.type || 'application/octet-stream' })
}
