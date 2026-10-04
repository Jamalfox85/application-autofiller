import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { ApplicationAccount } from '../../types/index.ts'
import {
  getIcimsAccount,
  hasIcimsAccountCredentials,
  isIcimsAccountCreationEmailStep,
  isIcimsCandidateHost,
  isIcimsLoginPath,
  isIcimsLoginSurface,
  pageHasEmailGate,
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
import { maybeWarnMissingIcimsAccount, planIcimsLoginPass } from './icims.ts'

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

test('login surface is the /login path or the email gate, before any application fields', () => {
  assert.equal(isIcimsLoginSurface(loginPage), true)
  // After Apply the top window (and the embedded frame) is …/jobs/{id}/…/login.
  // The first screen is email + Next, with no password and no application fields.
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/4821/warehouse-associate/login',
      search: '?in_iframe=1',
      hasPasswordField: false,
      hasEmailGate: false,
    }),
    true,
  )
  assert.equal(
    isIcimsLoginSurface({
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/4821/warehouse-associate/job',
      search: '?in_iframe=1',
      hasPasswordField: false,
      hasEmailGate: true,
    }),
    true,
  )
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
      hasEmailGate: false,
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

const gateDocument = (headings: string[], inputs: Array<{ type?: string; name?: string; autocomplete?: string }>) => ({
  querySelectorAll(selector: string) {
    if (selector === 'input') {
      return inputs.map((input) => ({
        textContent: '',
        getAttribute: (name: string) => {
          if (name === 'type') return input.type ?? null
          if (name === 'name') return input.name ?? null
          if (name === 'autocomplete') return input.autocomplete ?? null
          return null
        },
      }))
    }
    return headings.map((text) => ({ textContent: text, getAttribute: () => null }))
  },
})

test('email-first gate matches Enter Your Information plus an email field', () => {
  assert.equal(
    pageHasEmailGate(
      gateDocument(['Enter Your Information'], [{ type: 'email', name: 'email', autocomplete: 'email' }]),
    ),
    true,
  )
  // IC-1 has no EU/UK checkbox. IC-2/IC-3 add that checkbox and hCaptcha. Neither is required.
  assert.equal(
    pageHasEmailGate(gateDocument(['Enter Your Information'], [{ type: 'text', autocomplete: 'email' }])),
    true,
  )
  assert.equal(
    pageHasEmailGate(gateDocument(['Enter Your Information'], [{ type: 'checkbox', name: 'euResident' }])),
    false,
  )
  assert.equal(
    pageHasEmailGate(gateDocument(['Warehouse Associate'], [{ type: 'email', name: 'email' }])),
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

    assert.equal(
      await maybeWarnMissingIcimsAccount(null, {
        hostname: 'careers-acme.icims.com',
        pathname: '/jobs/4821/warehouse-associate/login',
        search: '?in_iframe=1',
        hasPasswordField: false,
      }),
      true,
    )
    assert.equal(await maybeWarnMissingIcimsAccount(null, loginPage), false)
    assert.equal(await maybeWarnMissingIcimsAccount(null, loginPage), false)
    assert.equal(messages.length, 1)
    assert.equal((messages[0] as { action: string }).action, 'icimsAccountRequired')
  } finally {
    resetIcimsAccountNoticeState()
  }
})

test('maybeWarn publishes for the email gate with no password and no application fields', async () => {
  resetIcimsAccountNoticeState()
  const messages: unknown[] = []
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({ personalInfo: {} }),
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
        hostname: 'acme.icims.com',
        pathname: '/jobs/4821/warehouse-associate/job',
        search: '?in_iframe=1',
        hasPasswordField: false,
        hasEmailGate: true,
      }),
      true,
    )
    assert.equal((messages[0] as { action: string }).action, 'icimsAccountRequired')
  } finally {
    resetIcimsAccountNoticeState()
  }
})

const jobyEmailStep = {
  hostname: 'careers-jobyaviation.icims.com',
  pathname: '/jobs/5424/autonomy-embedded-engineer/login',
  search: '?mobile=false&in_iframe=1',
  hasPasswordField: false,
  hasEmailGate: true,
}

const hireRightEmailStep = {
  hostname: 'careersintl-hireright1.icims.com',
  pathname: '/jobs/6855/software-engineer/login',
  search: '',
  hasPasswordField: false,
  hasEmailGate: true,
}

test('email step is Enter Your Information before any password field', () => {
  assert.equal(isIcimsAccountCreationEmailStep(jobyEmailStep), true)
  assert.equal(isIcimsAccountCreationEmailStep(hireRightEmailStep), true)
  assert.equal(
    isIcimsAccountCreationEmailStep({
      hostname: 'careers-acme.icims.com',
      pathname: '/jobs/123/role/job',
      hasPasswordField: false,
      hasEmailGate: true,
    }),
    true,
  )
  assert.equal(
    isIcimsAccountCreationEmailStep({
      ...jobyEmailStep,
      hasPasswordField: true,
    }),
    false,
  )
  assert.equal(
    isIcimsAccountCreationEmailStep({
      hostname: 'careers-jobyaviation.icims.com',
      pathname: '/jobs/5424/autonomy-embedded-engineer/job',
      hasPasswordField: false,
      hasEmailGate: false,
    }),
    false,
  )
  assert.equal(
    isIcimsAccountCreationEmailStep({
      hostname: 'www.icims.com',
      pathname: '/jobs/5424/login',
      hasPasswordField: false,
      hasEmailGate: true,
    }),
    false,
  )
})

test('login pass writes the email step once and still writes the password step', () => {
  assert.deepEqual(planIcimsLoginPass(jobyEmailStep, false), {
    warnIfMissing: true,
    writeGate: true,
  })
  assert.deepEqual(planIcimsLoginPass(jobyEmailStep, true), {
    warnIfMissing: true,
    writeGate: false,
  })
  assert.deepEqual(planIcimsLoginPass({ ...hireRightEmailStep, hasPasswordField: true }, true), {
    warnIfMissing: true,
    writeGate: true,
  })
  assert.deepEqual(
    planIcimsLoginPass(
      {
        hostname: 'careers-jobyaviation.icims.com',
        pathname: '/jobs/5424/autonomy-embedded-engineer/job',
        hasPasswordField: false,
        hasEmailGate: false,
      },
      false,
    ),
    { warnIfMissing: false, writeGate: false },
  )
})

test('iCIMS does not publish a create-account popup or its handoff', () => {
  assert.equal(existsSync(new URL('./icimsAccountHandoff.ts', import.meta.url)), false)
  const files = [
    'src/utils/siteRules/icims.ts',
    'src/utils/siteRules/icimsFields.ts',
    'src/utils/siteRules/icimsAccount.ts',
    'src/content/index.js',
    'docs/icims-dry-run.md',
  ]
  for (const file of files) {
    const text = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
    assert.equal(text.includes('Create your iCIMS account'), false, file)
    assert.equal(text.includes('icimsAccountHandoff'), false, file)
    assert.equal(text.includes('publishIcimsAccountCreationHandoff'), false, file)
  }
})

test('email step with a saved account does not raise the missing-login warning', async () => {
  resetIcimsAccountNoticeState()
  const messages: unknown[] = []
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({ personalInfo: { applicationAccounts: [account()] } }),
    },
    sendMessage: async (message) => {
      messages.push(message)
    },
    showOnPage: () => undefined,
  })
  try {
    assert.equal(await maybeWarnMissingIcimsAccount({ applicationAccounts: [] }, jobyEmailStep), false)
  } finally {
    resetIcimsAccountNoticeState()
  }
  assert.deepEqual(messages, [])
})

test('email step with no saved account keeps the missing-login warning', async () => {
  resetIcimsAccountNoticeState()
  const messages: unknown[] = []
  configureIcimsAccountNotice({
    storage: {
      get: async () => ({ personalInfo: {} }),
      set: async () => undefined,
    },
    sendMessage: async (message) => {
      messages.push(message)
    },
    showOnPage: () => undefined,
  })
  try {
    assert.equal(await maybeWarnMissingIcimsAccount(null, hireRightEmailStep), true)
  } finally {
    resetIcimsAccountNoticeState()
  }
  assert.equal(messages.length, 1)
  const sent = messages[0] as { action: string; notice?: { message?: string } }
  assert.equal(sent.action, 'icimsAccountRequired')
  assert.equal(String(sent.notice?.message || '').includes('Create your iCIMS account'), false)
})

test('email-step DOM changes do not count as an application step', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const dom = new JSDOM(
    `<!doctype html><body>
      <h1>Enter Your Information</h1>
      <input type="email" name="email" id="email" autocomplete="email" />
    </body>`,
    {
      url: 'https://careers-jobyaviation.icims.com/jobs/5424/autonomy-embedded-engineer/login?mobile=false',
    },
  )
  Object.assign(globalThis, { window: dom.window, document: dom.window.document })
  try {
    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    assert.equal(rule.formChanged?.([]), false)
    const captcha = dom.window.document.createElement('textarea')
    captcha.name = 'h-captcha-response'
    captcha.id = 'h-captcha-response'
    dom.window.document.body.appendChild(captcha)
    assert.equal(rule.formChanged?.([]), false)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})

test('password step still reports a new form after the email step', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const dom = new JSDOM(
    `<!doctype html><body>
      <input type="password" name="password" id="password" />
    </body>`,
    { url: 'https://careers-jobyaviation.icims.com/jobs/5424/autonomy-embedded-engineer/login' },
  )
  Object.assign(globalThis, { window: dom.window, document: dom.window.document })
  try {
    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    rule.formChanged?.([])
    const confirm = dom.window.document.createElement('input')
    confirm.type = 'password'
    confirm.name = 'passwordConfirm'
    confirm.id = 'passwordConfirm'
    dom.window.document.body.appendChild(confirm)
    assert.equal(rule.formChanged?.([]), true)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
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
