import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { ApplicationAccount, PersonalInfo } from '../../types/index.ts'
import {
  getWorkdayAccount,
  hasSavedWorkdayApplicationAccount,
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
  assert.equal(hasSavedWorkdayApplicationAccount(null), false)
  assert.equal(hasSavedWorkdayApplicationAccount({ accountEmail: 'legacy@example.com', accountPassword: 'legacy-secret' }), false)
})

test('a myworkday host row is a saved Workday account and a generic Workday row wins', () => {
  const hostOnly = getWorkdayAccount({
    applicationAccounts: [
      account({
        portal: 'cisco.wd5.myworkdayjobs.com',
        email: 'cisco@example.com',
        password: 'cisco-secret',
      }),
      account({ id: 3, portal: 'Greenhouse', email: 'gh@example.com', password: 'nope' }),
    ],
    email: 'person@example.com',
  })
  assert.deepEqual(hostOnly, { email: 'cisco@example.com', password: 'cisco-secret' })
  assert.equal(
    hasSavedWorkdayApplicationAccount({
      applicationAccounts: [
        account({ portal: 'myworkdayjobs', email: 'jobs@example.com', password: 'jobs-secret' }),
      ],
    }),
    true,
  )
  const genericWins = getWorkdayAccount({
    applicationAccounts: [
      account({
        portal: 'cisco.wd5.myworkdayjobs.com',
        email: 'cisco@example.com',
        password: 'cisco-secret',
      }),
      account({ id: 2, portal: 'Workday', email: 'generic@example.com', password: 'generic-secret' }),
    ],
  })
  assert.deepEqual(genericWins, { email: 'generic@example.com', password: 'generic-secret' })
  assert.equal(
    hasSavedWorkdayApplicationAccount({
      applicationAccounts: [account({ portal: 'www.workday.com', email: 'corp@example.com', password: 'corp' })],
    }),
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

const CISCO_CREATE_ACCOUNT = `<!doctype html><body>
  <input data-automation-id="email" id="email" type="text" />
  <input data-automation-id="password" id="password" type="password" />
  <input data-automation-id="verifyPassword" id="verify" type="password" />
  <button data-automation-id="createAccountSubmitButton" id="create-submit">Create Account</button>
  <button id="sign-in" type="button">Sign In</button>
</body>`

test('Cisco Create Account fills the saved Workday Application Account and does not submit', async () => {
  const dom = new JSDOM(CISCO_CREATE_ACCOUNT, {
    url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers_Site/login',
  })
  const doc = dom.window.document
  const email = doc.getElementById('email') as HTMLInputElement
  const password = doc.getElementById('password') as HTMLInputElement
  const verify = doc.getElementById('verify') as HTMLInputElement
  let submits = 0
  let focusouts = 0
  doc.getElementById('create-submit')!.addEventListener('click', () => {
    submits += 1
  })
  doc.getElementById('sign-in')!.addEventListener('click', () => {
    submits += 1
  })
  for (const field of [email, password, verify]) {
    field.addEventListener('focusout', () => {
      focusouts += 1
    })
  }
  resetWorkdayAccountNoticeState()
  const toasts: string[] = []
  configureWorkdayAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: {
          email: 'person@example.com',
          applicationAccounts: [
            {
              id: 1,
              portal: 'Workday',
              email: 'cisco-acct@example.com',
              password: 'cisco-secret',
              requireConfirmation: true,
            },
          ],
        },
      }),
    },
    showOnPage: (message) => {
      toasts.push(message)
    },
    sendMessage: async () => undefined,
  })
  try {
    const { default: workdayConfig } = await import('./workday.ts')
    const rule = workdayConfig()
    const snapshot = { email: 'person@example.com' } as PersonalInfo
    assert.equal(await rule.apply(email, 'email', snapshot), true)
    assert.equal(await rule.apply(password, 'password', snapshot), true)
    assert.equal(await rule.apply(verify, 'verify password', snapshot), true)
    assert.equal(email.value, 'cisco-acct@example.com')
    assert.notEqual(email.value, 'person@example.com')
    assert.equal(password.value, 'cisco-secret')
    assert.equal(verify.value, 'cisco-secret')
    assert.equal(submits, 0)
    assert.equal(focusouts, 3)
    assert.deepEqual(toasts, [])
  } finally {
    resetWorkdayAccountNoticeState()
  }
})

test('Cisco Create Account with no Workday Application Account stays empty and notifies testers', async () => {
  const dom = new JSDOM(CISCO_CREATE_ACCOUNT, {
    url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers_Site/login',
  })
  const doc = dom.window.document
  const email = doc.getElementById('email') as HTMLInputElement
  const password = doc.getElementById('password') as HTMLInputElement
  const verify = doc.getElementById('verify') as HTMLInputElement
  let submits = 0
  doc.getElementById('create-submit')!.addEventListener('click', () => {
    submits += 1
  })
  resetWorkdayAccountNoticeState()
  const toasts: string[] = []
  const stored: Record<string, unknown>[] = []
  const messages: unknown[] = []
  configureWorkdayAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: { email: 'person@example.com' },
      }),
      set: async (items) => {
        stored.push(items)
      },
    },
    showOnPage: (message) => {
      toasts.push(message)
    },
    sendMessage: async (message) => {
      messages.push(message)
    },
  })
  try {
    const { default: workdayConfig } = await import('./workday.ts')
    const rule = workdayConfig()
    const snapshot = { email: 'person@example.com' } as PersonalInfo
    assert.equal(await rule.apply(email, 'email', snapshot), true)
    assert.equal(await rule.apply(password, 'password', snapshot), true)
    assert.equal(await rule.apply(verify, 'verify password', snapshot), true)
    assert.equal(email.value, '')
    assert.equal(password.value, '')
    assert.equal(verify.value, '')
    assert.notEqual(email.value, 'person@example.com')
    assert.equal(submits, 0)
    assert.equal(toasts.length, 1)
    assert.match(toasts[0], /Workday Application Account/)
    assert.match(toasts[0], /autofill/i)
    assert.equal(toasts[0], WORKDAY_ACCOUNT_MISSING_MESSAGE)
    const notice = parseWorkdayAccountNotice(stored[0]?.[WORKDAY_ACCOUNT_NOTICE_KEY])
    assert.equal(notice?.message, WORKDAY_ACCOUNT_MISSING_MESSAGE)
    assert.equal((messages[0] as { action?: string })?.action, 'workdayAccountRequired')
  } finally {
    resetWorkdayAccountNoticeState()
  }
})

test('legacy account fields still fill, and the tester notice still asks for an Application Account', async () => {
  const dom = new JSDOM(CISCO_CREATE_ACCOUNT, {
    url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers_Site/login',
  })
  const doc = dom.window.document
  const email = doc.getElementById('email') as HTMLInputElement
  const password = doc.getElementById('password') as HTMLInputElement
  resetWorkdayAccountNoticeState()
  const toasts: string[] = []
  configureWorkdayAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: {
          email: 'person@example.com',
          accountEmail: 'legacy@example.com',
          accountPassword: 'legacy-secret',
        },
      }),
    },
    showOnPage: (message) => {
      toasts.push(message)
    },
    sendMessage: async () => undefined,
  })
  try {
    const { default: workdayConfig } = await import('./workday.ts')
    const rule = workdayConfig()
    const snapshot = { email: 'person@example.com' } as PersonalInfo
    assert.equal(await rule.apply(email, 'email', snapshot), true)
    assert.equal(await rule.apply(password, 'password', snapshot), true)
    assert.equal(email.value, 'legacy@example.com')
    assert.notEqual(email.value, 'person@example.com')
    assert.equal(password.value, 'legacy-secret')
    assert.deepEqual(toasts, [WORKDAY_ACCOUNT_MISSING_MESSAGE])
  } finally {
    resetWorkdayAccountNoticeState()
  }
})

test('a generic myworkdayjobs sign-in fills the vault and does not click Sign In', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <form id="login">
        <input data-automation-id="email" id="email" type="text" autocomplete="username" />
        <input data-automation-id="password" id="password" type="password" />
        <button data-automation-id="signInSubmitButton" id="sign-in">Sign In</button>
      </form>
    </body>`,
    { url: 'https://company.wd5.myworkdayjobs.com/en-US/External/login' },
  )
  const doc = dom.window.document
  let signInClicks = 0
  doc.getElementById('sign-in')!.addEventListener('click', () => {
    signInClicks += 1
  })
  resetWorkdayAccountNoticeState()
  configureWorkdayAccountNotice({
    storage: {
      get: async () => ({
        personalInfo: {
          email: 'person@example.com',
          applicationAccounts: [
            {
              id: 4,
              portal: 'myworkdayjobs',
              email: 'vault@example.com',
              password: 'vault-secret',
              requireConfirmation: false,
            },
          ],
        },
      }),
    },
    showOnPage: () => undefined,
    sendMessage: async () => undefined,
  })
  try {
    const { default: workdayConfig } = await import('./workday.ts')
    const rule = workdayConfig()
    const email = doc.getElementById('email') as HTMLInputElement
    const password = doc.getElementById('password') as HTMLInputElement
    const snapshot = { email: 'person@example.com' } as PersonalInfo
    assert.equal(await rule.apply(email, 'email', snapshot), true)
    assert.equal(await rule.apply(password, 'password', snapshot), true)
    assert.equal(email.value, 'vault@example.com')
    assert.equal(password.value, 'vault-secret')
    assert.equal(signInClicks, 0)
  } finally {
    resetWorkdayAccountNoticeState()
  }
})
