import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/background/background.js', // Source path
          dest: 'background', // Destination folder inside dist
        },
        {
          src: 'index.html', // Source path
          dest: '', // Destination folder is dist itself
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        content: 'src/main.js', // Build `main.js` as the content script
        background: 'src/background/background.js', // Add `background.js` as another entry point
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Dynamically name files based on their entry point
          if (chunkInfo.name === 'content') {
            return 'main.js' // Output content script as `main.js`
          }
          if (chunkInfo.name === 'background') {
            return 'background/background.js' // Output background script into `background/`
          }
          return '[name].js' // Default naming for other files
        },
      },
      external: [],
    },
    commonjsOptions: {
      include: [/node_modules/], // Include dependencies in the bundle
    },
  },
})
