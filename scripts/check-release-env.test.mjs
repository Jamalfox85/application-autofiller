import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const run = (url, extra = {}) =>
  spawnSync('node', ['scripts/check-release-env.mjs'], {
    env: { PATH: process.env.PATH, VITE_RESUME_API_URL: url, ...extra },
    encoding: 'utf8',
  }).status

test('release guard rejects unset/localhost, accepts prod, allows dev opt-in', () => {
  // .env may supply a value; an explicit empty process env var wins over it.
  assert.equal(run(''), 1)
  assert.equal(run('http://localhost:8080/api/v1'), 1)
  assert.equal(run('http://127.0.0.1:8080/api/v1'), 1)
  assert.equal(run('https://api-production-5aca1.up.railway.app/api/v1'), 0)
  assert.equal(run('http://localhost:8080/api/v1', { GOFILLR_ALLOW_LOCAL_API: '1' }), 0)
})
