// The service worker is copied as-is (it is not a Vite entry). Emit the shared
// attribution module next to it so background.js can import it at runtime, and
// bundle ExtensionPay into that same unpack output.
import * as esbuild from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
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
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const define = {
  'import.meta.env.VITE_EXTENSIONPAY_EXTENSION_ID': JSON.stringify(
    process.env.VITE_EXTENSIONPAY_EXTENSION_ID || 'gofillr',
  ),
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL ?? ''),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ''),
  'import.meta.env.VITE_RESUME_API_URL': JSON.stringify(process.env.VITE_RESUME_API_URL ?? ''),
  'import.meta.env.VITE_RESUME_API_KEY': JSON.stringify(process.env.VITE_RESUME_API_KEY ?? ''),
}

await mkdir('dist/src/services', { recursive: true })
await esbuild.build({
  entryPoints: ['src/services/installAttribution.ts'],
  outfile: 'dist/src/services/installAttribution.js',
  format: 'esm',
  bundle: true,
  platform: 'neutral',
})

await esbuild.build({
  entryPoints: ['src/services/extensionPayWorker.ts'],
  outfile: 'dist/src/services/extensionPayWorker.js',
  format: 'esm',
  bundle: true,
  platform: 'browser',
  define,
})

await esbuild.build({
  entryPoints: ['src/services/extensionPayContent.ts'],
  outfile: 'dist/extensionPayContent.js',
  format: 'iife',
  bundle: true,
  platform: 'browser',
})
