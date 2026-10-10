// The value Vite inlines for VITE_BUILD_CHANNEL during `vite build` (mode production).
// A shell value wins. Otherwise later files override earlier ones:
// .env, .env.local, .env.production, .env.production.local.
import { existsSync, readFileSync } from 'node:fs'

export function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function viteBuildChannel(shellValue = process.env.VITE_BUILD_CHANNEL) {
  if (shellValue !== undefined) return shellValue
  let value = ''
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const parsed = parseEnvFile(file)
    if (parsed.VITE_BUILD_CHANNEL !== undefined) value = parsed.VITE_BUILD_CHANNEL
  }
  return value
}
