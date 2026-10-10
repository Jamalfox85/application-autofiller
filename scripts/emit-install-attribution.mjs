// The service worker is copied as-is (it is not a Vite entry). Emit the shared
// attribution module next to it so background.js can import it at runtime, and
// bundle ExtensionPay into that same unpack output.
import * as esbuild from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { viteBuildChannel } from './vite-build-channel.mjs'

// Captured before .env is copied onto process.env so a mode file can still
// override .env, matching Vite. A shell value stays first.
const inlinedBuildChannel = viteBuildChannel()

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
    process.env.VITE_EXTENSIONPAY_EXTENSION_ID || 'gofillr-admin',
  ),
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL ?? ''),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ''),
  'import.meta.env.VITE_RESUME_API_URL': JSON.stringify(process.env.VITE_RESUME_API_URL ?? ''),
  'import.meta.env.VITE_RESUME_API_KEY': JSON.stringify(process.env.VITE_RESUME_API_KEY ?? ''),
  'import.meta.env.VITE_BUILD_CHANNEL': JSON.stringify(inlinedBuildChannel),
}

await mkdir('dist/src/services/billing', { recursive: true })
await mkdir('dist/src/utils/siteRules', { recursive: true })
// Copied as-is so chrome.scripting.executeScript can stringify the page function
// without a bundler renaming its body.
await copyFile(
  'src/utils/siteRules/icimsPageDropdownCommand.js',
  'dist/src/utils/siteRules/icimsPageDropdownCommand.js',
)
await copyFile(
  'src/utils/siteRules/icimsFrameAutofill.js',
  'dist/src/utils/siteRules/icimsFrameAutofill.js',
)
await esbuild.build({
  entryPoints: ['src/services/billing/quotaPage.ts'],
  outfile: 'dist/src/services/billing/quotaPage.js',
  format: 'esm',
  bundle: true,
  platform: 'neutral',
})
await esbuild.build({
  entryPoints: ['src/services/installAttribution.ts'],
  outfile: 'dist/src/services/installAttribution.js',
  format: 'esm',
  bundle: true,
  platform: 'neutral',
})
// background.js imports this for build_channel. It is not a Vite entry.
await esbuild.build({
  entryPoints: ['src/services/mixpanelConfig.ts'],
  outfile: 'dist/src/services/mixpanelConfig.js',
  format: 'esm',
  bundle: true,
  platform: 'browser',
  define,
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
  entryPoints: ['src/services/googleSignInWorker.ts'],
  outfile: 'dist/src/services/googleSignInWorker.js',
  format: 'esm',
  bundle: true,
  platform: 'browser',
  define,
})

await esbuild.build({
  entryPoints: ['src/services/resumeVaultWorker.ts'],
  outfile: 'dist/src/services/resumeVaultWorker.js',
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

await esbuild.build({
  entryPoints: ['src/services/matchScoreWorker.ts'],
  outfile: 'dist/src/services/matchScoreWorker.js',
  format: 'esm',
  bundle: true,
  platform: 'browser',
  define,
})

await esbuild.build({
  entryPoints: ['src/utils/contentScriptConnection.ts'],
  outfile: 'dist/src/utils/contentScriptConnection.js',
  format: 'esm',
  bundle: true,
  platform: 'neutral',
})

await esbuild.build({
  entryPoints: ['src/utils/siteRules/bamboohrResumeWorker.ts'],
  outfile: 'dist/src/utils/siteRules/bamboohrResumeWorker.js',
  format: 'esm',
  bundle: true,
  platform: 'browser',
  define,
})
