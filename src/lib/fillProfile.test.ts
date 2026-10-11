import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { matchFieldToData } from '../content/fieldMatch.ts'
import { dispatchFillEvent } from '../utils/inputHandlers.ts'
import { leverPlan } from '../utils/siteRules/leverFields.ts'
import { fetchActiveProfileForFill, fetchedProfileStillActive } from './activeProfileForFill.ts'
import { dbRowsToProfile } from './sync/profileRows.ts'
import {
  activePersonalInfoFromMessage,
  loadFillPersonalInfo,
  resolveFillPersonalInfo,
} from './fillProfile.ts'
import type { PersonalInfo } from '../types/index.ts'

const STALE_COMPANY = 'American Reading Company'
const STALE_TITLE = 'Full Stack Developer'
const CURRENT_COMPANY = 'Acme Software'
const CURRENT_TITLE = 'Product Engineer'

const staleExperience = [
  {
    id: 1,
    companyName: STALE_COMPANY,
    jobTitle: STALE_TITLE,
    startDate: '2019-01',
    endDate: '2022-06',
    present: false,
    description: 'Parsed from Jamal Fox resume',
  },
]

const staleParseBlob = {
  phase: 'done',
  parsed: {
    name: 'Jamal Fox',
    work_history: [{ company: STALE_COMPANY, title: STALE_TITLE, current: true }],
  },
}

function alexRows(workExperience: Array<Record<string, unknown>>, workHistory: unknown) {
  return {
    profile: {
      id: 'profile-alex',
      first_name: 'Alex',
      last_name: 'Rivera',
      email: 'alex@example.com',
      full_name: 'Alex Rivera',
      work_history: workHistory,
    },
    work_experience: workExperience,
    education: [],
    skills: [],
  }
}

const acmeRow = {
  company_name: CURRENT_COMPANY,
  job_title: CURRENT_TITLE,
  present: true,
  start_date: '2023-04-01',
}

function companyPlan(info: PersonalInfo) {
  return leverPlan({ name: 'org', type: 'text', label: 'Current company' }, info, 0)
}

function titlePlan(info: PersonalInfo) {
  return leverPlan({ name: 'cards[a][field1]', type: 'text', label: 'Current title' }, info, 0)
}

test('the active profile current company wins over a stale mirror and a leftover parse', () => {
  const active = dbRowsToProfile(
    alexRows([acmeRow], [{ company: STALE_COMPANY, title: STALE_TITLE, current: true }]),
  )
  assert.equal(active.experience[0]?.companyName, CURRENT_COMPANY)
  assert.equal(active.experience[0]?.jobTitle, CURRENT_TITLE)

  const resolved = resolveFillPersonalInfo({
    active,
    mirror: {
      firstName: 'Jamal',
      lastName: 'Fox',
      experience: staleExperience,
    },
    parsedResume: staleParseBlob,
  })

  assert.equal(resolved.firstName, 'Alex')
  assert.equal(resolved.lastName, 'Rivera')
  assert.equal(companyPlan(resolved)?.value, CURRENT_COMPANY)
  assert.equal(titlePlan(resolved)?.value, CURRENT_TITLE)
  assert.equal(matchFieldToData('currentcompany', resolved, [])?.matchedValue, CURRENT_COMPANY)
  assert.equal(matchFieldToData('jobtitle', resolved, [])?.matchedValue, CURRENT_TITLE)
  assert.equal(JSON.stringify(resolved).includes(STALE_COMPANY), false)
  assert.equal(JSON.stringify(resolved).includes(STALE_TITLE), false)
})

test('a cleared work history is not restored from the mirror or an old parsed resume', () => {
  const active = dbRowsToProfile(
    alexRows([], [{ company: STALE_COMPANY, title: STALE_TITLE, current: true }]),
  )
  assert.equal(active.firstName, 'Alex')
  assert.equal(active.experience.length, 0)

  const resolved = resolveFillPersonalInfo({
    active,
    mirror: { firstName: 'Alex', lastName: 'Rivera', experience: staleExperience },
    parsedResume: staleParseBlob,
  })
  assert.equal(resolved.experience.length, 0)
  assert.equal(companyPlan(resolved), null)
  assert.equal(titlePlan(resolved), null)
  assert.equal(matchFieldToData('currentcompany', resolved, []), null)
})

test('an offline fill uses the mirror and does not refill cleared jobs from a parse blob', async () => {
  const fromMirror = resolveFillPersonalInfo({
    active: null,
    mirror: {
      firstName: 'Alex',
      lastName: 'Rivera',
      experience: [
        {
          id: 2,
          companyName: CURRENT_COMPANY,
          jobTitle: CURRENT_TITLE,
          startDate: '',
          endDate: '',
          present: true,
          description: '',
        },
      ],
    },
    parsedResume: staleParseBlob,
  })
  assert.equal(companyPlan(fromMirror)?.value, CURRENT_COMPANY)
  assert.equal(titlePlan(fromMirror)?.value, CURRENT_TITLE)

  const cleared = await loadFillPersonalInfo({
    mirror: { firstName: 'Alex', lastName: 'Rivera', experience: [] },
    parsedResume: staleParseBlob,
    requestActive: () => Promise.reject(new Error('offline')),
    timeoutMs: 20,
  })
  assert.equal(cleared.experience.length, 0)
  assert.equal(companyPlan(cleared), null)

  const timedOut = await loadFillPersonalInfo({
    mirror: {
      firstName: 'Alex',
      lastName: 'Rivera',
      experience: [
        {
          companyName: CURRENT_COMPANY,
          jobTitle: CURRENT_TITLE,
          startDate: '',
          endDate: '',
          present: true,
          description: '',
        },
      ],
    },
    parsedResume: staleParseBlob,
    requestActive: () => new Promise(() => {}),
    timeoutMs: 20,
  })
  assert.equal(timedOut.experience[0]?.companyName, CURRENT_COMPANY)
  assert.equal(timedOut.experience[0]?.jobTitle, CURRENT_TITLE)
})

test('get_profile is the fill source, and a profile swap discards the in-flight read', async () => {
  let body = ''
  const fetched = await fetchActiveProfileForFill({
    supabaseUrl: 'https://example.supabase.co/',
    anonKey: 'anon-key',
    accessToken: 'access-token',
    profileId: 'profile-alex',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/get_profile')
      assert.equal(init.headers.Authorization, 'Bearer access-token')
      body = init.body
      return {
        ok: true,
        json: async () => alexRows([acmeRow], null),
      }
    },
  })
  assert.equal(body, JSON.stringify({ p_profile_id: 'profile-alex' }))
  assert.equal(fetched?.personalInfo.experience[0]?.companyName, CURRENT_COMPANY)
  assert.equal(fetched?.personalInfo.experience[0]?.jobTitle, CURRENT_TITLE)

  const message = activePersonalInfoFromMessage({ ok: true, personalInfo: fetched?.personalInfo })
  assert.equal(companyPlan(message!)?.value, CURRENT_COMPANY)
  assert.equal(activePersonalInfoFromMessage({ ok: false }), null)
  assert.equal(activePersonalInfoFromMessage(null), null)

  assert.equal(fetchedProfileStillActive('profile-alex', 'profile-alex', 'profile-alex'), true)
  assert.equal(fetchedProfileStillActive('profile-alex', 'profile-other', 'profile-alex'), false)
  assert.equal(fetchedProfileStillActive(null, 'profile-other', 'profile-alex'), false)
  assert.equal(fetchedProfileStillActive(null, null, 'profile-alex'), true)
})

test('a fill event from an invalid pattern does not escape the fill', () => {
  // Chrome throws from dispatchEvent when a listener calls checkValidity. Node's
  // EventTarget reports that asynchronously, so this stands in for the page.
  const target = {
    dispatchEvent() {
      throw new SyntaxError(
        "Failed to execute 'checkValidity' on 'HTMLInputElement': Invalid regular expression: /[A-Za-z0-9._%+-]/v: Invalid character in character class",
      )
    },
  }
  assert.doesNotThrow(() => dispatchFillEvent(target, new Event('change')))

  const other = {
    dispatchEvent() {
      throw new Error('react blew up')
    },
  }
  assert.throws(() => dispatchFillEvent(other, new Event('change')), /react blew up/)
})

test('the service worker is what the fill asks for the active profile', () => {
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  const autofill = readFileSync(new URL('../content/autofill.ts', import.meta.url), 'utf8')
  assert.equal(background.includes("request.action === 'loadActiveProfileForFill'"), true)
  assert.equal(background.includes('loadActiveProfileForFillWorker'), true)
  assert.equal(background.includes('./src/services/activeProfileForFillWorker.js'), true)
  assert.equal(emit.includes('src/services/activeProfileForFillWorker.ts'), true)
  assert.equal(autofill.includes("action: 'loadActiveProfileForFill'"), true)
  assert.equal(autofill.includes('loadFillPersonalInfo'), true)
})
