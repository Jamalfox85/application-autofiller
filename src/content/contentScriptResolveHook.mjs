import * as esbuild from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Node cannot import the content script as written: extensionless specifiers,
// `@/` aliases, and type imports. Transform each file on its own so module-level
// `let` stays `let`. Bundling would turn those into `var` and hide the
// temporal-dead-zone crash this test is here to catch.

const srcUrl = new URL('../', import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier
  if (spec.startsWith('@/')) spec = new URL(spec.slice(2), srcUrl).href
  try {
    return await nextResolve(spec, context)
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    for (const ext of ['.ts', '.js', '.mjs', '.tsx']) {
      try {
        return await nextResolve(spec + ext, context)
      } catch (inner) {
        if (inner?.code !== 'ERR_MODULE_NOT_FOUND') throw inner
      }
    }
    throw error
  }
}

export async function load(url, context, nextLoad) {
  if (url.includes('/node_modules/')) return nextLoad(url, context)
  const loader = url.endsWith('.tsx')
    ? 'tsx'
    : url.endsWith('.ts')
      ? 'ts'
      : url.endsWith('.js') || url.endsWith('.mjs')
        ? 'js'
        : null
  if (!loader) return nextLoad(url, context)
  const source = await readFile(fileURLToPath(url), 'utf8')
  const result = await esbuild.transform(source, {
    loader,
    format: 'esm',
    target: 'esnext',
    sourcefile: url,
    define: {
      'import.meta.env': 'globalThis.__GOFILLR_IMPORT_META_ENV__',
    },
  })
  return { format: 'module', source: result.code, shortCircuit: true }
}
