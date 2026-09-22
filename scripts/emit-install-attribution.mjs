// The service worker is copied as-is (it is not a Vite entry). Emit the shared
// attribution module next to it so background.js can import it at runtime.
import * as esbuild from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('dist/src/services', { recursive: true })
await esbuild.build({
  entryPoints: ['src/services/installAttribution.ts'],
  outfile: 'dist/src/services/installAttribution.js',
  format: 'esm',
  bundle: true,
  platform: 'neutral',
})
