import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('field elements are not logged', () => {
  const autofill = read('../content/autofill.ts')
  assert.equal(/console\.log\([^)]*fieldText/.test(autofill), false)
  assert.equal(/console\.log\([^)]*,\s*input\)/.test(autofill), false)
})

test('production builds drop console.log', () => {
  assert.match(read('../../vite.config.ts'), /pure: \['console\.log'/)
  assert.match(read('../../vite.content.config.ts'), /pure: \['console\.log'/)
})
