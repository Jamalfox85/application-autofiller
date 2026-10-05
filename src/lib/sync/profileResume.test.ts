import assert from 'node:assert/strict'
import test from 'node:test'
import { COPY_RESUME_FAILED_COPY, copyProfileResume, deleteResumeFile } from './profileResume.ts'
import {
  PLAN_REFRESH_PATH,
  parsePlanRefreshBody,
  postPlanRefresh,
  readExtPayApiKey,
} from '../../services/billing/planRefresh.ts'

const BASE = 'https://api.example.com/api/v1/'

function recorder(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(body == null ? null : JSON.stringify(body), { status })
  }
  return { calls, fetchImpl }
}

test('copy-resume posts from_profile_id to the new profile and classifies the outcome', async () => {
  const ok = recorder(200, {
    success: true,
    data: { profile_id: 'new', resume_file_path: 'u/new/resume.pdf', resume_file_name: 'ada.pdf' },
  })
  const copied = await copyProfileResume({ token: 't', baseUrl: BASE, apiKey: 'k', profileId: 'new', fromProfileId: 'old', fetchImpl: ok.fetchImpl })
  assert.deepEqual(copied, { kind: 'copied', resumeFilePath: 'u/new/resume.pdf', resumeFileName: 'ada.pdf' })
  assert.equal(ok.calls[0].url, 'https://api.example.com/api/v1/profiles/new/copy-resume')
  assert.equal(ok.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(String(ok.calls[0].init.body)), { from_profile_id: 'old' })
  const headers = ok.calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer t')
  assert.equal(headers['X-API-Key'], 'k')

  for (const status of [404, 409]) {
    const r = recorder(status, { success: false, error: { code: 'resume_not_found', message: 'x' } })
    assert.deepEqual(
      await copyProfileResume({ token: 't', baseUrl: BASE, profileId: 'n', fromProfileId: 'o', fetchImpl: r.fetchImpl }),
      { kind: 'nothing_to_copy' },
    )
  }
  const bad = recorder(502, { success: false, error: 'storage' })
  assert.deepEqual(
    await copyProfileResume({ token: 't', baseUrl: BASE, profileId: 'n', fromProfileId: 'o', fetchImpl: bad.fetchImpl }),
    { kind: 'failed', status: 502 },
  )
  assert.equal(COPY_RESUME_FAILED_COPY, 'Couldn’t copy the resume, upload it again.')
})

test('resume delete sends the path delete_profile returned', async () => {
  const r = recorder(204, null)
  const result = await deleteResumeFile({ token: 't', baseUrl: BASE, resumeFilePath: 'u/b/resume.pdf', fetchImpl: r.fetchImpl })
  assert.deepEqual(result, { ok: true, status: 204 })
  assert.equal(r.calls[0].url, 'https://api.example.com/api/v1/resumes/delete')
  assert.deepEqual(JSON.parse(String(r.calls[0].init.body)), { resume_file_path: 'u/b/resume.pdf' })
  const inUse = recorder(409, { success: false, error: { code: 'resume_in_use' } })
  assert.equal((await deleteResumeFile({ token: 't', baseUrl: BASE, resumeFilePath: 'p', fetchImpl: inUse.fetchImpl })).ok, true)
  const forbidden = recorder(403, { success: false, error: { code: 'profile_forbidden' } })
  assert.equal((await deleteResumeFile({ token: 't', baseUrl: BASE, resumeFilePath: 'p', fetchImpl: forbidden.fetchImpl })).ok, false)
})

test('plan refresh sends only the ExtPay key, read from sync then local', async () => {
  const area = (value?: string, fail = false) => ({
    async get(key: string) {
      if (fail) throw new Error('sync unavailable')
      return value ? { [key]: value } : {}
    },
  })
  assert.equal(await readExtPayApiKey({ sync: area('sync-key'), local: area('local-key') }), 'sync-key')
  assert.equal(await readExtPayApiKey({ sync: area(undefined, true), local: area('local-key') }), 'local-key')
  assert.equal(await readExtPayApiKey({ sync: area(), local: area() }), null)

  const r = recorder(200, { success: true, data: { plan: 'free', verified: true, changed: true } })
  const result = await postPlanRefresh({ token: 't', extpayApiKey: 'ext', baseUrl: BASE, apiKey: 'k', fetchImpl: r.fetchImpl })
  assert.deepEqual(result, { ok: true, plan: 'free', verified: true, changed: true })
  assert.equal(r.calls[0].url, `https://api.example.com/api/v1${PLAN_REFRESH_PATH}`)
  assert.deepEqual(JSON.parse(String(r.calls[0].init.body)), { extpay_api_key: 'ext' })

  // ExtensionPay unreachable: keep the current plan.
  assert.deepEqual(parsePlanRefreshBody(200, { success: true, data: { plan: 'pro', verified: false, changed: false } }), {
    ok: true,
    plan: 'pro',
    verified: false,
    changed: false,
  })
  assert.deepEqual(parsePlanRefreshBody(503, null), { ok: false, reason: 'http_503' })
  const down: typeof fetch = async () => {
    throw new Error('offline')
  }
  assert.equal((await postPlanRefresh({ token: 't', extpayApiKey: 'e', baseUrl: BASE, fetchImpl: down })).ok, false)
})
