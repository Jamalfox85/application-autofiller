// Release guard: the shipped extension must talk to the production resume API.
// Fails the build if VITE_RESUME_API_URL is unset or points at localhost / a loopback address.
// Dev opt-in: `npm run build:dev` (sets GOFILLR_ALLOW_LOCAL_API=1 and adds localhost to dist/manifest.json).
import { existsSync, readFileSync } from 'node:fs'

const env = { ...process.env }
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let value = t.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    if (env[key] === undefined) env[key] = value
  }
}

export function checkResumeApiUrl(value, allowLocal = false) {
  const url = (value ?? '').trim()
  if (!url) return 'VITE_RESUME_API_URL is unset'
  let host
  try {
    host = new URL(url).hostname
  } catch {
    return `VITE_RESUME_API_URL is not a valid URL: ${url}`
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(host) || host.endsWith('.localhost')
  if (local && !allowLocal) return `VITE_RESUME_API_URL points at localhost (${url})`
  if (!allowLocal && !url.startsWith('https://')) return `VITE_RESUME_API_URL must be https (${url})`
  return null
}

const problem = checkResumeApiUrl(env.VITE_RESUME_API_URL, env.GOFILLR_ALLOW_LOCAL_API === '1')
if (problem) {
  console.error(`\nRelease build blocked: ${problem}.`)
  console.error('Set VITE_RESUME_API_URL=https://api-production-5aca1.up.railway.app/api/v1')
  console.error('For local API development use: npm run build:dev\n')
  process.exit(1)
}
