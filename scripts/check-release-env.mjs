// Release guard: the shipped extension must talk to the production resume API,
// and must not be stamped as the test analytics channel.
// Fails the build if VITE_RESUME_API_URL is unset or points at localhost / a loopback address,
// or if VITE_BUILD_CHANNEL=test.
// Dev opt-in for a local API: `npm run build:dev` (sets GOFILLR_ALLOW_LOCAL_API=1 and adds localhost to dist/manifest.json).
// VITE_BUILD_CHANNEL=test is rejected for that build too. Unpacked installs report test without the variable.
import { existsSync, readFileSync } from 'node:fs'
import { viteBuildChannel } from './vite-build-channel.mjs'

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

export function checkBuildChannel(value) {
  const channel = (value ?? '').trim()
  if (channel === 'test') return 'VITE_BUILD_CHANNEL=test is not allowed in a release build'
  return null
}

const problem = checkResumeApiUrl(env.VITE_RESUME_API_URL, env.GOFILLR_ALLOW_LOCAL_API === '1')
if (problem) {
  console.error(`\nRelease build blocked: ${problem}.`)
  console.error('Set VITE_RESUME_API_URL=https://api-production-5aca1.up.railway.app/api/v1')
  console.error('For local API development use: npm run build:dev\n')
  process.exit(1)
}

// Same value Vite will inline, including .env.production. A test stamp only in
// that file must still fail the release build.
const channelProblem = checkBuildChannel(viteBuildChannel())
if (channelProblem) {
  console.error(`\nRelease build blocked: ${channelProblem}.`)
  console.error('Unset VITE_BUILD_CHANNEL, or set VITE_BUILD_CHANNEL=production.')
  console.error('An unpacked install is reported as test without this variable.\n')
  process.exit(1)
}
