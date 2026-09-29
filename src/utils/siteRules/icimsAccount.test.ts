import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApplicationAccount } from '../../types/index.ts'
import {
  getIcimsAccount,
  hasIcimsAccountCredentials,
  isIcimsCandidateHost,
  isIcimsLoginPath,
  isIcimsLoginSurface,
} from './icimsAccount.ts'
import {
  ICIMS_ACCOUNT_MISSING_MESSAGE,
  ICIMS_ACCOUNT_NOTICE_KEY,
  configureIcimsAccountNotice,
  parseIcimsAccountNotice,
  publishMissingIcimsAccountNotice,
  readPersonalInfoForIcims,
  resetIcimsAccountNoticeState,
} from './icimsAccountNotice.ts'
import { maybeWarnMissingIcimsAccount } from './icims.ts'

const account = (overrides: Partial<ApplicationAccount> = {}): ApplicationAccount => ({
  id: 1,
  portal: 'iCIMS',
  email: 'icims@example.com',
  password: 'correct horse',
  requireConfirmation: true,
  ...overrides,
})

const loginPage = {
  hostname: 'careers-acme.icims.com',
  pathname: '/jobs/123/role/login',
  search: '',
}

test('iCIMS candidate hosts are career portals, not the corporate or recruiter site', () => {
  assert.equal(isIcimsCandidateHost('careers-acme.icims.com'), true)
  assert.equal(isIcimsCandidateHost('acme.icims.com'), true)
  // ats.ts / jobSitePatterns list these for telemetry. They are not apply hosts.
  assert.equal(isIcimsCandidateHost('www.icims.com'), false)
  assert.equal(isIcimsCandidateHost('icims.com'), false)
  assert.equal(isIcimsCandidateHost('login.icims.com'), false)
  assert.equal(isIcimsCandidateHost('jobs.lever.co'), false)
  assert.equal(isIcimsCandidateHost('noticims.com'), false)
})

test('login paths match sign-in routes and skip job descriptions', () => {
  assert.equal(isIcimsLoginPath('/jobs/123/role/login'), true)
  assert.equal(isIcimsLoginPath('/jobs/123/login'), true)
  assert.equal(isIcimsLoginPath('/jobs/123/role/create-account'), true)
  assert.equal(isIcimsLoginPath('/jobs/123/role/job', '?mode=login'), true)
  assert.equal(isIcimsLoginPath('/jobs/123/role/job', '?action=register'), true)
  assert.equal(isIcimsLoginPath('/jobs/123/role/job'), false)
  assert.equal(isIcimsLoginPath('/jobs/search'), false)
  assert.equal(isIcimsLoginPath('/jobs/intro'), false)
})

test('login surface requires a candidate host plus a login route or password field', () => {
  assert.equal(isIcimsLoginSurface(loginPage), true)
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/123/role/job',
      hasPasswordField: true,
    }),
    true,
  )
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/123/role/job',
      hasPasswordField: false,
    }),
    false,
  )
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'www.icims.com',
      pathname: '/jobs/123/role/login',
    }),
    false,
  )
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'login.icims.com',
      pathname: '/login',
      hasPasswordField: true,
    }),
    false,
  )
})

test('icims site rule detect still matches any icims.com host', async () => {
  const previous = globalThis.window
  const location = { hostname: 'careers-acme.icims.com' }
  Object.assign(globalThis, { window: { location } })
  try {
    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    assert.equal(rule.detect(), true)
    location.hostname = 'www.icims.com'
    assert.equal(rule.detect(), true)
    location.hostname = 'jobs.lever.co'
    assert.equal(rule.detect(), false)
  } finally {
    globalThis.window = previous
  }
})

test('icims fill stub still writes email autocomplete and skips AddressStreet2', async () => {
  const { default: icimsConfig } = await import('./icims.ts')
  const rule = icimsConfig()
  const email = {
    getAttribute: (name: string) => (name === 'autocomplete' ? 'email' : null),
    value: '',
  }
  assert.equal(
    await rule.apply(email as unknown as HTMLInputElement, 'Email', {
      email: 'person@example.com',
    } as never),
    true,
  )
  assert.equal(email.value, 'person@example.com')

  const street2 = {
    getAttribute: () => null,
    value: 'leave-me',
  }
  assert.equal(
    await rule.apply(street2 as unknown as HTMLInputElement, 'AddressStreet2', {} as never),
    true,
  )
  assert.equal(street2.value, 'leave-me')
  assert.equal(
    await rule.apply(street2 as unknown as HTMLInputElement, 'FirstName', {} as never),
    false,
  )
})

test('getIcimsAccount prefers an iCIMS application account and skips other portals', () => {
  const resolved = getIcimsAccount({
    applicationAccounts: [
      account({ portal: 'Workday', email: 'wd@example.com', password: 'wd-secret' }),
      account(),
    ],
    accountEmail: 'legacy@example.com',
    accountPassword: 'legacy-secret',
  })
  assert.deepEqual(resolved, { email: 'icims@example.com', password: 'correct horse' })
  assert.equal(hasIcimsAccountCredentials({ applicationAccounts: [account()] }), true)
})

test('getIcimsAccount matches the portal case-insensitively', () => {
  const resolved = getIcimsAccount({
    applicationAccounts: [
      account({ portal: 'Greenhouse', email: 'gh@example.com', password: 'nope' }),
      account({ id: 2, portal: ' ICIMS ', email: 'saved@example.com', password: 'from-row' }),
    ],
  })
  assert.deepEqual(resolved, { email: 'saved@example.com', password: 'from-row' })
})

test('legacy Workday account fields are not an iCIMS login', () => {
  assert.deepEqual(
    getIcimsAccount({
      accountEmail: 'legacy@example.com',
      accountPassword: 'legacy-secret',
    }),
    { email: '', password: '' },
  )
  assert.equal(
    hasIcimsAccountCredentials({
      accountEmail: 'legacy@example.com',
      accountPassword: 'legacy-secret',
    }),
    false,
  )
  assert.equal(
    hasIcimsAccountCredentials({
      applicationAccounts: [account({ portal: 'Workday' })],
    }),
    false,
  )
})

test('a later complete iCIMS row wins over an earlier blank one', () => {
  const resolved = getIcimsAccount({
    applicationAccounts: [
      account({ email: '', password: '' }),
      account({ id: 2, email: 'second@example.com', password: 'second-secret' }),
    ],
  })
  assert.deepEqual(resolved, { email: 'second@example.com', password: 'second-secret' })
})

test('missing iCIMS credentials are not treated as fillable', () => {
  assert.equal(hasIcimsAccountCredentials(null), false)
  assert.equal(hasIcimsAccountCredentials({}), false)
  assert.equal(
    hasIcimsAccountCredentials({ applicationAccounts: [account({ password: '   ' })] }),
    false,
  )
  assert.equal(
    hasIcimsAccountCredentials({ applicationAccounts: [account({ email: '  ' })] }),
    false,
  )
})

test('missing-account notice is published once to the page, storage, and the extension', async () => {
  resetIcimsAccountNoticeState()
  const stored: Record<string, unknown>[] = []
  const messages: unknown[] = []
  const toasts: string[] = []
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  configureIcimsAccountNotice({
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
    assert.equal(await publishMissingIcimsAccountNotice(), true)
    assert.equal(await publishMissingIcimsAccountNotice(), false)
  } finally {
    console.warn = originalWarn
    resetIcimsAccountNoticeState()
  }

  assert.deepEqual(toasts, [ICIMS_ACCOUNT_MISSING_MESSAGE])
  assert.equal(stored.length, 1)
  const notice = parseIcimsAccountNotice(stored[0]?.[ICIMS_ACCOUNT_NOTICE_KEY])
  assert.ok(notice)
  assert.equal(notice?.message, ICIMS_ACCOUNT_MISSING_MESSAGE)
  assert.equal(notice?.portal, 'iCIMS')
  assert.deepEqual(messages, [{ action: 'icimsAccountRequired', notice }])
  assert.equal(warnings.length, 1)
})

test('notice parser rejects anything that is not an iCIMS account notice', () => {
  assert.equal(parseIcimsAccountNotice(null), null)
  assert.equal(parseIcimsAccountNotice({ portal: 'Workday', message: 'x' }), null)
  assert.equal(parseIcimsAccountNotice({ portal: 'iCIMS', message: '   ' }), null)
  const parsed = parseIcimsAccountNotice({
    portal: 'iCIMS',
    message: ICIMS_ACCOUNT_MISSING_MESSAGE,
    at: 5,
  })
  assert.deepEqual(parsed, {
    portal: 'iCIMS',
    message: ICIMS_ACCOUNT_MISSING_MESSAGE,
    at: 5,
  })
})

test('readPersonalInfoForIcims prefers the stored profile over the page snapshot', async () => {
  resetIcimsAccountNoticeState()
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: { applicationAccounts: [account()] },
      }),
    },
  })
  try {
    const info = await readPersonalInfoForIcims({
      applicationAccounts: [account({ email: 'stale@example.com', password: 'stale-secret' })],
    })
    assert.equal(hasIcimsAccountCredentials(info), true)
    assert.equal(getIcimsAccount(info).email, 'icims@example.com')
  } finally {
    resetIcimsAccountNoticeState()
  }
})

test('maybeWarn publishes only on a login surface with incomplete iCIMS credentials', async () => {
  resetIcimsAccountNoticeState()
  const messages: unknown[] = []
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({ personalInfo: { applicationAccounts: [] } }),
      set: async () => undefined,
    },
    sendMessage: async (message) => {
      messages.push(message)
    },
    showOnPage: () => undefined,
  })

  try {
    assert.equal(
      await maybeWarnMissingIcimsAccount(null, {
        hostname: 'careers-acme.icims.com',
        pathname: '/jobs/123/role/job',
      }),
      false,
    )
    assert.equal(messages.length, 0)

    assert.equal(await maybeWarnMissingIcimsAccount(null, loginPage), true)
    assert.equal(await maybeWarnMissingIcimsAccount(null, loginPage), false)
    assert.equal(messages.length, 1)
    assert.equal((messages[0] as { action: string }).action, 'icimsAccountRequired')
  } finally {
    resetIcimsAccountNoticeState()
  }
})

test('maybeWarn stays quiet when the iCIMS login is already saved', async () => {
  resetIcimsAccountNoticeState()
  const toasts: string[] = []
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({ personalInfo: { applicationAccounts: [account()] } }),
    },
    showOnPage: (message) => {
      toasts.push(message)
    },
  })
  try {
    assert.equal(await maybeWarnMissingIcimsAccount({ applicationAccounts: [] }, loginPage), false)
    assert.deepEqual(toasts, [])
  } finally {
    resetIcimsAccountNoticeState()
  }
})
