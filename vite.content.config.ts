import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Dedicated build for the content script. Single entry, IIFE output — no chunk splitting is
// possible, so it can't end up loading a separate ES module chunk (Manifest V3 content
// scripts can't do that; see the comment in vite.config.ts). Runs as a second pass after the
// popup build (emptyOutDir: false) so it doesn't wipe out that build's output.
// Production bundles drop console.log/debug so field text, HTML and payloads never reach the
// page's console. console.error/warn stay.
export default defineConfig({
  esbuild: { pure: ['console.log', 'console.debug'] },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.js'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'content.css' ? '[name].[ext]' : 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
