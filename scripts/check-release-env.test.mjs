import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const run = (url, extra = {}) =>
  spawnSync('node', ['scripts/check-release-env.mjs'], {
    env: { PATH: process.env.PATH, VITE_RESUME_API_URL: url, ...extra },
    encoding: 'utf8',
  }).status

test('release guard rejects a test analytics channel', () => {
  const prod = 'https://api-production-5aca1.up.railway.app/api/v1'
  assert.equal(run(prod, { VITE_BUILD_CHANNEL: 'test' }), 1)
  assert.equal(run(prod, { VITE_BUILD_CHANNEL: ' test ' }), 1)
  assert.equal(run(prod, { VITE_BUILD_CHANNEL: 'production' }), 0)
  assert.equal(run(prod, { VITE_BUILD_CHANNEL: '' }), 0)
  assert.equal(run(prod), 0)
  // A local-API dev build still must not ship the test stamp.
  assert.equal(run(prod, { VITE_BUILD_CHANNEL: 'test', GOFILLR_ALLOW_LOCAL_API: '1' }), 1)
})

test('release guard rejects VITE_BUILD_CHANNEL=test from .env.production', () => {
  const prod = 'https://api-production-5aca1.up.railway.app/api/v1'
  const dir = mkdtempSync(join(tmpdir(), 'gofillr-channel-'))
  const script = fileURLToPath(new URL('./check-release-env.mjs', import.meta.url))
  try {
    writeFileSync(join(dir, '.env.production'), 'VITE_BUILD_CHANNEL=test\n')
    const failed = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH, VITE_RESUME_API_URL: prod },
      encoding: 'utf8',
    })
    assert.equal(failed.status, 1)

    writeFileSync(join(dir, '.env.production'), 'VITE_BUILD_CHANNEL=production\n')
    const ok = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH, VITE_RESUME_API_URL: prod },
      encoding: 'utf8',
    })
    assert.equal(ok.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release guard rejects unset/localhost, accepts prod, allows dev opt-in', () => {
  // .env may supply a value; an explicit empty process env var wins over it.
  assert.equal(run(''), 1)
  assert.equal(run('http://localhost:8080/api/v1'), 1)
  assert.equal(run('http://127.0.0.1:8080/api/v1'), 1)
  assert.equal(run('https://api-production-5aca1.up.railway.app/api/v1'), 0)
  assert.equal(run('http://localhost:8080/api/v1', { GOFILLR_ALLOW_LOCAL_API: '1' }), 0)
})
