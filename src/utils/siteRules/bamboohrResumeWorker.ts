// Runs in the service worker, outside the apply page's connect-src, and returns
// the saved resume bytes for the content script to assign.
import { loadSavedResumeFromAccount } from './bamboohrResume.ts'

export async function loadSavedResumeForWorker(): Promise<
  { ok: true; fileName: string; mimeType: string; bytes: Uint8Array } | { ok: false }
> {
  const file = await loadSavedResumeFromAccount()
  if (!file || file.size <= 0 || !file.name) return { ok: false }
  return {
    ok: true,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    bytes: new Uint8Array(await file.arrayBuffer()),
  }
}
