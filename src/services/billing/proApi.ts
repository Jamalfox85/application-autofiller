import { getValidAccessToken } from '../../lib/api.ts'
import {
  postProResume,
  resumeApiBaseUrl,
  type ProResumeAction,
  type ProResumeResult,
} from './proApiContract.ts'

export {
  PRO_RESUME_PATHS,
  proResumeHeaders,
  summarizeProData,
  type ProResumeAction,
  type ProResumeResult,
} from './proApiContract.ts'

export async function callProResume(
  action: ProResumeAction,
  body: Record<string, unknown>,
  options?: { fetchImpl?: typeof fetch; baseUrl?: string; apiKey?: string | null; token?: string },
): Promise<ProResumeResult> {
  const token = options?.token ?? (await getValidAccessToken())
  return postProResume({
    action,
    body,
    token,
    baseUrl: resumeApiBaseUrl(options?.baseUrl ?? (import.meta.env.VITE_RESUME_API_URL as string | undefined)),
    apiKey: options?.apiKey ?? (import.meta.env.VITE_RESUME_API_KEY as string | undefined),
    fetchImpl: options?.fetchImpl,
  })
}
