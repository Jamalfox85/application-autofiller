// Resume-file side effects of profile create/delete. Users cannot copy or delete storage
// objects themselves, so both go through resume-api (docs/multi-profiles.md).
import { proResumeHeaders, resumeApiBaseUrl } from '../../services/billing/proApiContract.ts'

export type CopyResumeOutcome =
  | { kind: 'copied'; resumeFilePath: string; resumeFileName: string | null }
  // Source has no file (404 resume_not_found) or the target already has one (409): nothing
  // for the user to do.
  | { kind: 'nothing_to_copy' }
  // 502 or network: the profile exists without a resume.
  | { kind: 'failed'; status: number }

export const COPY_RESUME_FAILED_COPY = 'Couldn’t copy the resume, upload it again.'

interface HttpInput {
  token: string
  baseUrl: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => '')
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function copyProfileResume(
  input: HttpInput & { profileId: string; fromProfileId: string },
): Promise<CopyResumeOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(
      `${resumeApiBaseUrl(input.baseUrl)}/profiles/${encodeURIComponent(input.profileId)}/copy-resume`,
      {
        method: 'POST',
        headers: proResumeHeaders(input.token, input.apiKey),
        body: JSON.stringify({ from_profile_id: input.fromProfileId }),
      },
    )
    const body = (await readJson(response)) as {
      success?: boolean
      data?: { resume_file_path?: unknown; resume_file_name?: unknown }
    } | null
    if (response.status === 200 && body?.success === true && typeof body.data?.resume_file_path === 'string') {
      return {
        kind: 'copied',
        resumeFilePath: body.data.resume_file_path,
        resumeFileName: typeof body.data.resume_file_name === 'string' ? body.data.resume_file_name : null,
      }
    }
    if (response.status === 404 || response.status === 409) return { kind: 'nothing_to_copy' }
    return { kind: 'failed', status: response.status }
  } catch {
    return { kind: 'failed', status: 0 }
  }
}

// Call after delete_profile with the path it returned. 204 (including a missing object) is
// success; 409 resume_in_use means another profile still points at it, which is fine.
export async function deleteResumeFile(
  input: HttpInput & { resumeFilePath: string },
): Promise<{ ok: boolean; status: number }> {
  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(`${resumeApiBaseUrl(input.baseUrl)}/resumes/delete`, {
      method: 'POST',
      headers: proResumeHeaders(input.token, input.apiKey),
      body: JSON.stringify({ resume_file_path: input.resumeFilePath }),
    })
    return { ok: response.status === 204 || response.status === 409, status: response.status }
  } catch {
    return { ok: false, status: 0 }
  }
}
