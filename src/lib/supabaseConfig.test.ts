import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_BUILD_ENV_MESSAGE, supabasePublicConfigError } from './supabaseConfig.ts'

test('createClient throws when a build omits the supabase url', () => {
  assert.throws(
    () => createClient(undefined as unknown as string, undefined as unknown as string),
    /supabaseUrl is required/,
  )
})

test('a build with no supabase env fails in the popup instead of throwing at import', () => {
  const error = supabasePublicConfigError(undefined, undefined)
  assert.equal(error, SUPABASE_BUILD_ENV_MESSAGE)
  assert.match(error!, /VITE_SUPABASE_URL/)
  assert.match(error!, /VITE_SUPABASE_ANON_KEY/)
})

test('placeholder .env.example values are not a configured build', () => {
  assert.equal(
    supabasePublicConfigError('https://your-project-ref.supabase.co', 'your-anon-key'),
    SUPABASE_BUILD_ENV_MESSAGE,
  )
  assert.ok(supabasePublicConfigError('not-a-url', 'real-key'))
  assert.ok(supabasePublicConfigError('https://abc.supabase.co', '   '))
})

test('a real project url and key let the popup boot', () => {
  assert.equal(supabasePublicConfigError('https://abc.supabase.co', 'sb_publishable_test'), null)
})
