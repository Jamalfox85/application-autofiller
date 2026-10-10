import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// ES module equivalent of __dirname
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Popup build only — the content script gets its own config (vite.content.config.ts) and
// build pass. Both entries used to share one Rollup build, but any module imported by both
// (e.g. src/services/mixpanel.ts, used by both the popup and the content script) got split
// into a separate chunk that content.js then loaded via a static `import` statement.
// Manifest V3 content scripts can't load ES module chunks (only background service workers
// support "type": "module"), so that shared chunk would have been a silent runtime break.
// A dedicated single-entry build for content.js sidesteps chunk-splitting entirely.
// Production bundles drop console.log/debug so field text, HTML and payloads never reach the
// page's console. console.error/warn stay.
export default defineConfig({
  esbuild: { pure: ['console.log', 'console.debug'] },
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
