import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Present on release-success spawns so the key guard does not change URL/channel cases.
// Not a live credential. Assertions below require it never appear in script output.
const RELEASE_TEST_KEY = 'km7q-release-guard-dummy-0123456789abcd'

const run = (url, extra = {}) =>
  spawnSync('node', ['scripts/check-release-env.mjs'], {
    env: {
      PATH: process.env.PATH,
      VITE_RESUME_API_URL: url,
      VITE_RESUME_API_KEY: RELEASE_TEST_KEY,
      ...extra,
    },
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
      env: { PATH: process.env.PATH, VITE_RESUME_API_URL: prod, VITE_RESUME_API_KEY: RELEASE_TEST_KEY },
      encoding: 'utf8',
    })
    assert.equal(failed.status, 1)

    writeFileSync(join(dir, '.env.production'), 'VITE_BUILD_CHANNEL=production\n')
    const ok = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH, VITE_RESUME_API_URL: prod, VITE_RESUME_API_KEY: RELEASE_TEST_KEY },
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

function assertKeyHidden(output, secret) {
  assert.equal(output.includes(secret), false)
  assert.equal(output.includes(RELEASE_TEST_KEY), false)
}

test('release guard rejects an unset, empty, or placeholder resume API key', () => {
  const prod = 'https://api-production-5aca1.up.railway.app/api/v1'
  const script = fileURLToPath(new URL('./check-release-env.mjs', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'gofillr-apikey-'))
  const secret = 'tempfile-resume-key-0123456789abcdef'
  try {
    const blocked = (extra) =>
      spawnSync(process.execPath, [script], {
        cwd: dir,
        env: { PATH: process.env.PATH, VITE_RESUME_API_URL: prod, ...extra },
        encoding: 'utf8',
      })

    const missing = blocked({})
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /VITE_RESUME_API_KEY is unset/)
    assertKeyHidden(`${missing.stdout}${missing.stderr}`, secret)

    for (const value of ['', '   ', '\t']) {
      const empty = blocked({ VITE_RESUME_API_KEY: value })
      assert.equal(empty.status, 1)
      assert.match(empty.stderr, /VITE_RESUME_API_KEY is unset/)
      assertKeyHidden(`${empty.stdout}${empty.stderr}`, secret)
    }

    const placeholder = blocked({ VITE_RESUME_API_KEY: 'your-resume-api-key' })
    assert.equal(placeholder.status, 1)
    assert.match(placeholder.stderr, /VITE_RESUME_API_KEY is a placeholder/)
    assert.equal(`${placeholder.stdout}${placeholder.stderr}`.includes('your-resume-api-key'), false)

    const padded = blocked({ VITE_RESUME_API_KEY: '  your-resume-api-key  ' })
    assert.equal(padded.status, 1)
    assert.match(padded.stderr, /VITE_RESUME_API_KEY is a placeholder/)
    assert.equal(`${padded.stdout}${padded.stderr}`.includes('your-resume-api-key'), false)

    const ok = blocked({ VITE_RESUME_API_KEY: secret })
    assert.equal(ok.status, 0)
    assertKeyHidden(`${ok.stdout}${ok.stderr}`, secret)

    // A bad URL still fails first, and still must not echo the key.
    const local = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        VITE_RESUME_API_URL: 'http://localhost:8080/api/v1',
        VITE_RESUME_API_KEY: secret,
      },
      encoding: 'utf8',
    })
    assert.equal(local.status, 1)
    assert.match(local.stderr, /localhost/)
    assertKeyHidden(`${local.stdout}${local.stderr}`, secret)

    // Dev opt-in matches the URL check: local builds are not release builds.
    assert.equal(
      run('http://localhost:8080/api/v1', { GOFILLR_ALLOW_LOCAL_API: '1', VITE_RESUME_API_KEY: '' }),
      0,
    )
    assert.equal(
      run('http://localhost:8080/api/v1', {
        GOFILLR_ALLOW_LOCAL_API: '1',
        VITE_RESUME_API_KEY: 'your-resume-api-key',
      }),
      0,
    )

    writeFileSync(join(dir, '.env'), `VITE_RESUME_API_URL=${prod}\nVITE_RESUME_API_KEY=${secret}\n`)
    const fromFile = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    })
    assert.equal(fromFile.status, 0)
    assertKeyHidden(`${fromFile.stdout}${fromFile.stderr}`, secret)

    writeFileSync(
      join(dir, '.env'),
      `VITE_RESUME_API_URL=${prod}\nVITE_RESUME_API_KEY="your-resume-api-key"\n`,
    )
    const filePlaceholder = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    })
    assert.equal(filePlaceholder.status, 1)
    assert.match(filePlaceholder.stderr, /VITE_RESUME_API_KEY is a placeholder/)
    assert.equal(`${filePlaceholder.stdout}${filePlaceholder.stderr}`.includes('your-resume-api-key'), false)

    // An explicit empty process env var wins over a real key in .env, same as the URL check.
    writeFileSync(join(dir, '.env'), `VITE_RESUME_API_URL=${prod}\nVITE_RESUME_API_KEY=${secret}\n`)
    const emptyWins = spawnSync(process.execPath, [script], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        VITE_RESUME_API_URL: prod,
        VITE_RESUME_API_KEY: '',
      },
      encoding: 'utf8',
    })
    assert.equal(emptyWins.status, 1)
    assert.match(emptyWins.stderr, /VITE_RESUME_API_KEY is unset/)
    assertKeyHidden(`${emptyWins.stdout}${emptyWins.stderr}`, secret)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
