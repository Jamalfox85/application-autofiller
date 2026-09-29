import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApplicationAccount } from '../../types/index.ts'
import {
  getWorkdayAccount,
  hasWorkdayAccountCredentials,
  isWorkdayApplyHost,
} from './workdayAccount.ts'
import {
  WORKDAY_ACCOUNT_MISSING_MESSAGE,
  WORKDAY_ACCOUNT_NOTICE_KEY,
  configureWorkdayAccountNotice,
  parseWorkdayAccountNotice,
  publishMissingWorkdayAccountNotice,
  readPersonalInfoForWorkday,
  resetWorkdayAccountNoticeState,
} from './workdayAccountNotice.ts'

const account = (overrides: Partial<ApplicationAccount> = {}): ApplicationAccount => ({
  id: 1,
  portal: 'Workday',
  email: 'workday@example.com',
  password: 'correct horse',
  requireConfirmation: true,
  ...overrides,
})

test('Workday apply hosts match career sites and skip the corporate site', () => {
  assert.equal(isWorkdayApplyHost('company.wd5.myworkdayjobs.com'), true)
  assert.equal(isWorkdayApplyHost('Company.WD5.MyWorkdayJobs.com'), true)
  assert.equal(isWorkdayApplyHost('cisco.wd5.myworkdayjobs.com'), true)
  assert.equal(isWorkdayApplyHost('salesforce.wd12.myworkdayjobs.com'), true)
  assert.equal(isWorkdayApplyHost('zillow.wd5.myworkdayjobs.com'), true)
  assert.equal(isWorkdayApplyHost('acme.wd1.myworkday.com'), true)
  assert.equal(isWorkdayApplyHost('acme.wd3.myworkdaysite.com'), true)
  assert.equal(isWorkdayApplyHost('tenant.wd12.myworkdaysite.com'), true)
  // jobSitePatterns / ats.ts list workday.com for telemetry. It is not an apply host.
  assert.equal(isWorkdayApplyHost('www.workday.com'), false)
  assert.equal(isWorkdayApplyHost('jobs.lever.co'), false)
})

test('workday site rule detect follows apply hosts', async () => {
  const previous = globalThis.window
  const location = { hostname: 'company.wd5.myworkdayjobs.com' }
  Object.assign(globalThis, { window: { location } })
  try {
    const { default: workdayConfig } = await import('./workday.ts')
    const rule = workdayConfig()
    assert.equal(rule.detect(), true)
    location.hostname = 'www.workday.com'
    assert.equal(rule.detect(), false)
    location.hostname = 'tenant.wd12.myworkday.com'
    assert.equal(rule.detect(), true)
  } finally {
    globalThis.window = previous
  }
})

test('getWorkdayAccount prefers a Workday application account over legacy fields', () => {
  const resolved = getWorkdayAccount({
    applicationAccounts: [account(), account({ id: 2, portal: 'Greenhouse', email: 'gh@example.com' })],
    accountEmail: 'legacy@example.com',
    accountPassword: 'legacy-secret',
  })
  assert.deepEqual(resolved, { email: 'workday@example.com', password: 'correct horse' })
  assert.equal(hasWorkdayAccountCredentials({ applicationAccounts: [account()] }), true)
})

test('getWorkdayAccount matches the portal case-insensitively and skips other portals', () => {
  const resolved = getWorkdayAccount({
    applicationAccounts: [
      account({ portal: 'Greenhouse', email: 'gh@example.com', password: 'nope' }),
      account({ id: 2, portal: ' WORKDAY ', email: 'saved@example.com', password: 'from-row' }),
    ],
    accountEmail: 'legacy@example.com',
    accountPassword: 'legacy-secret',
  })
  assert.deepEqual(resolved, { email: 'saved@example.com', password: 'from-row' })
})

test('blank Workday account fields fall back to legacy email and password', () => {
  const resolved = getWorkdayAccount({
    applicationAccounts: [account({ email: '  ', password: '' })],
    accountEmail: 'legacy@example.com',
    accountPassword: 'legacy-secret',
  })
  assert.deepEqual(resolved, { email: 'legacy@example.com', password: 'legacy-secret' })
  assert.equal(hasWorkdayAccountCredentials({ accountEmail: 'legacy@example.com' }), false)
  assert.equal(
    hasWorkdayAccountCredentials({
      accountEmail: 'legacy@example.com',
      accountPassword: 'legacy-secret',
    }),
    true,
  )
})

test('a later complete Workday row wins over an earlier blank one', () => {
  const resolved = getWorkdayAccount({
    applicationAccounts: [
      account({ email: '', password: '' }),
      account({ id: 2, email: 'second@example.com', password: 'second-secret' }),
    ],
  })
  assert.deepEqual(resolved, { email: 'second@example.com', password: 'second-secret' })
})

test('missing Workday credentials are not treated as fillable', () => {
  assert.equal(hasWorkdayAccountCredentials(null), false)
  assert.equal(hasWorkdayAccountCredentials({}), false)
  assert.equal(
    hasWorkdayAccountCredentials({ applicationAccounts: [account({ password: '   ' })] }),
    false,
  )
})

test('missing-account notice is published once to the page, storage, and the extension', async () => {
  resetWorkdayAccountNoticeState()
  const stored: Record<string, unknown>[] = []
  const messages: unknown[] = []
  const toasts: string[] = []
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  configureWorkdayAccountNotice({
    storage: {
      set: async (items) => {
        stored.push(items)
      },
    },
    sendMessage: async (message) => {
      messages.push(message)
    },
    showOnPage: (message) => {
      toasts.push(message)
    },
  })

  try {
    assert.equal(await publishMissingWorkdayAccountNotice(), true)
    assert.equal(await publishMissingWorkdayAccountNotice(), false)
  } finally {
    console.warn = originalWarn
    resetWorkdayAccountNoticeState()
  }

  assert.deepEqual(toasts, [WORKDAY_ACCOUNT_MISSING_MESSAGE])
  assert.equal(stored.length, 1)
  const notice = parseWorkdayAccountNotice(stored[0]?.[WORKDAY_ACCOUNT_NOTICE_KEY])
  assert.ok(notice)
  assert.equal(notice?.message, WORKDAY_ACCOUNT_MISSING_MESSAGE)
  assert.equal(notice?.portal, 'Workday')
  assert.deepEqual(messages, [{ action: 'workdayAccountRequired', notice }])
  assert.equal(warnings.length, 1)
})

test('notice parser rejects anything that is not a Workday account notice', () => {
  assert.equal(parseWorkdayAccountNotice(null), null)
  assert.equal(parseWorkdayAccountNotice({ portal: 'Greenhouse', message: 'x' }), null)
  assert.equal(parseWorkdayAccountNotice({ portal: 'Workday', message: '   ' }), null)
  const parsed = parseWorkdayAccountNotice({
    portal: 'Workday',
    message: WORKDAY_ACCOUNT_MISSING_MESSAGE,
    at: 5,
  })
  assert.deepEqual(parsed, {
    portal: 'Workday',
    message: WORKDAY_ACCOUNT_MISSING_MESSAGE,
    at: 5,
  })
})

test('readPersonalInfoForWorkday prefers the stored profile over the page snapshot', async () => {
  resetWorkdayAccountNoticeState()
  configureWorkdayAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: { accountEmail: 'stored@example.com', accountPassword: 'stored-secret' },
      }),
    },
  })
  try {
    const info = await readPersonalInfoForWorkday({
      accountEmail: 'stale@example.com',
      accountPassword: 'stale-secret',
    })
    assert.equal(hasWorkdayAccountCredentials(info), true)
    assert.equal(getWorkdayAccount(info).email, 'stored@example.com')
  } finally {
    resetWorkdayAccountNoticeState()
  }
})
