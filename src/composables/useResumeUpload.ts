// Drives the resume upload without the popup owning the request.
//
// The parse takes several seconds and an extension popup is destroyed the moment it loses
// focus, which aborts any fetch it started. So: the popup base64-encodes the file and hands
// it to the background service worker, which does the request and writes the outcome to
// chrome.storage.local["resumeUploadJob"]. This composable mirrors that key into refs.
//
// The popup learns about the result two ways, for resilience:
//   1. chrome.storage.onChanged (instant, cross-context)
//   2. a 2s poll while a job is in flight (covers the rare case #1 doesn't fire)
// plus a hard timeout so "uploading" can never hang forever.
import { ref } from 'vue'
import { getValidAccessToken, normalizeParsedResume } from '../lib/api'
import type { ParsedResumeData } from '../types'

const STORAGE_KEY = 'resumeUploadJob'
// A finished (done/error) job older than this is treated as stale on the next popup open —
// otherwise reopening the popup days later would re-apply an old parse.
const STALE_MS = 5 * 60 * 1000
const POLL_MS = 2000
// Hard stop so "uploading" can't hang. Onboarding gives up sooner (Welcome.vue redirects at
// 30s); this mainly bounds the Links & files sheet, which has no other exit.
const UPLOAD_TIMEOUT_MS = 45_000

const RESUME_UPLOAD_URL = `${
  (import.meta.env.VITE_RESUME_API_URL as string | undefined) || 'http://localhost:8080/api/v1'
}/resumes/upload`

export type ResumeUploadPhase = 'idle' | 'uploading' | 'done' | 'error'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface JobState {
  phase: ResumeUploadPhase
  fileName?: string
  firstUpload?: boolean | null
  parsed?: any
  storagePath?: string | null
  code?: string
  message?: string
  httpStatus?: number
  updatedAt: number
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Module-level so every component that calls useResumeUpload() shares one job for the popup's
// lifetime (onboarding screen and the Links sheet both use it).
const phase = ref<ResumeUploadPhase>('idle')
const fileName = ref('')
const firstUpload = ref<boolean | null>(null)
const parsedResume = ref<ParsedResumeData | null>(null)
const errorMessage = ref('')
const errorCode = ref('')

let subscribed = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let deadline = 0

async function writeJob(state: Omit<JobState, 'updatedAt'>) {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...state, updatedAt: Date.now() } })
}

function apply(state: JobState | undefined | null) {
  try {
    const terminal = state && (state.phase === 'done' || state.phase === 'error')
    if (!state || (terminal && Date.now() - (state.updatedAt ?? 0) > STALE_MS)) {
      phase.value = 'idle'
      stopPolling()
      return
    }

    console.log('[resume-upload] state ->', state.phase, state.code ?? '')
    phase.value = state.phase
    fileName.value = state.fileName ?? fileName.value

    if (state.phase === 'done') {
      firstUpload.value = state.firstUpload ?? null
      parsedResume.value = state.parsed != null ? normalizeParsedResume(state.parsed) : null
      errorMessage.value = ''
      errorCode.value = ''
      stopPolling()
    } else if (state.phase === 'error') {
      errorMessage.value = state.message ?? 'Upload failed. Please try again.'
      errorCode.value = state.code ?? ''
      parsedResume.value = null
      stopPolling()
    } else if (state.phase === 'uploading') {
      startPolling()
    }
  } catch (err) {
    console.error('[resume-upload] failed to apply job state', err, state)
    phase.value = 'error'
    errorMessage.value = 'Something went wrong reading the parsed resume. Please try again.'
    errorCode.value = 'apply_failed'
    parsedResume.value = null
    stopPolling()
  }
}

function startPolling() {
  if (pollTimer) return
  deadline = Date.now() + UPLOAD_TIMEOUT_MS
  pollTimer = setInterval(async () => {
    const d = await chrome.storage.local.get(STORAGE_KEY)
    apply(d[STORAGE_KEY] as JobState)
    if (phase.value === 'uploading' && Date.now() > deadline) {
      console.warn('[resume-upload] timed out waiting for the worker')
      await writeJob({
        phase: 'error',
        code: 'timeout',
        message: "The resume service didn't finish in time. Please try again.",
      })
    }
  }, POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function guessMime(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return 'application/octet-stream'
}

export function useResumeUpload() {
  if (!subscribed) {
    subscribed = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        apply(changes[STORAGE_KEY].newValue as JobState)
      }
    })
    void chrome.storage.local.get(STORAGE_KEY).then((d) => apply(d[STORAGE_KEY] as JobState))
  }

  const start = async (file: File) => {
    console.log('[resume-upload] start', file.name, file.type, file.size)
    errorMessage.value = ''
    errorCode.value = ''
    parsedResume.value = null
    firstUpload.value = null
    fileName.value = file.name
    phase.value = 'uploading'
    startPolling()
    await writeJob({ phase: 'uploading', fileName: file.name })

    let token: string
    try {
      token = await getValidAccessToken()
    } catch {
      await writeJob({
        phase: 'error',
        code: 'no_session',
        message: 'Please sign in again before uploading your resume.',
      })
      return
    }

    let fileBytesBase64: string
    try {
      fileBytesBase64 = await fileToBase64(file)
    } catch {
      await writeJob({
        phase: 'error',
        code: 'read_failed',
        message: "Couldn't read that file. Please choose another.",
      })
      return
    }

    try {
      await chrome.runtime.sendMessage({
        action: 'uploadResume',
        url: RESUME_UPLOAD_URL,
        token,
        fileName: file.name,
        fileType: file.type || guessMime(file.name),
        fileBytesBase64,
      })
      console.log('[resume-upload] handed off to service worker')
    } catch (err) {
      console.error('[resume-upload] could not reach the service worker', err)
      await writeJob({
        phase: 'error',
        code: 'worker_unreachable',
        message: 'Something went wrong starting the upload. Please try again.',
      })
    }
  }

  // Call once the caller has consumed a done/error outcome, so a reopened popup doesn't act
  // on it again.
  const clear = async () => {
    stopPolling()
    phase.value = 'idle'
    errorMessage.value = ''
    errorCode.value = ''
    parsedResume.value = null
    firstUpload.value = null
    fileName.value = ''
    await chrome.storage.local.remove(STORAGE_KEY)
  }

  return { phase, fileName, firstUpload, parsedResume, errorMessage, errorCode, start, clear }
}
