import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// ES module equivalent of __dirname
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        content: resolve(__dirname, 'src/content/index.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Content script goes to root, not assets/
          return chunkInfo.name === 'content' ? '[name].js' : 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          // CSS for content script goes to root
          if (assetInfo.name === 'content.css') {
            return '[name].[ext]'
          }
          return 'assets/[name].[ext]'
        },
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
