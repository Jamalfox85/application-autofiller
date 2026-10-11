import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { editorPlace, personalDetailsForEditor, shouldRefreshPersonalDetails } from './editorPlace.ts'
import {
  PLAN_PENDING_LABEL,
  newProfileAction,
  proFeatureMeta,
  profilesRowAction,
  profilesRowMeta,
  rosterCountLabel,
} from './popupPlanGate.ts'
import { shouldWriteProfileLoad } from './profileLoadGuard.ts'
import { cloneDefaultPersonalInfo } from './personalInfoDefaults.ts'
import { customResponseSummary, customResponsesDone } from './customResponseSummary.ts'

test('custom responses summary shows the real count', () => {
  assert.equal(customResponseSummary(0), 'Tailor responses for specific questions')
  assert.equal(customResponseSummary(1), '1 response')
  assert.equal(customResponseSummary(4), '4 responses')
  assert.equal(customResponsesDone(0), false)
  assert.equal(customResponsesDone(4), true)

  const cards = readFileSync(new URL('./../utils/infocards.ts', import.meta.url), 'utf8')
  assert.match(cards, /customResponseSummary\(counts\?\.customResponses\)/)
  assert.match(cards, /customResponsesDone\(counts\?\.customResponses\)/)
})

test('editor country and state show a saved abbreviation such as Testville, PA', () => {
  const place = editorPlace('PA', '')
  assert.deepEqual(place, { state: 'Pennsylvania', country: 'united_states' })
  assert.deepEqual(editorPlace('PA', 'United States'), {
    state: 'Pennsylvania',
    country: 'united_states',
  })
  assert.deepEqual(editorPlace('Pennsylvania', 'united_states'), {
    state: 'Pennsylvania',
    country: 'united_states',
  })

  const edited = personalDetailsForEditor({
    ...cloneDefaultPersonalInfo(),
    city: 'Testville',
    state: 'PA',
    country: '',
  })
  assert.equal(edited.city, 'Testville')
  assert.equal(edited.state, 'Pennsylvania')
  assert.equal(edited.country, 'united_states')

  // The summary keeps the saved abbreviation; the editor is what has to resolve it.
  const cards = readFileSync(new URL('./../utils/infocards.ts', import.meta.url), 'utf8')
  assert.match(cards, /\$\{info\.city\}, \$\{info\.state\}/)

  // A place the selects do not know stays visible instead of collapsing to blank.
  assert.deepEqual(editorPlace('Bavaria', 'Germany'), { state: 'Bavaria', country: 'Germany' })
})

test('an open personal details form reloads when the active profile changes', () => {
  assert.equal(
    shouldRefreshPersonalDetails({ open: true, dirty: true, profileChanged: true, infoChanged: true }),
    true,
  )
  assert.equal(
    shouldRefreshPersonalDetails({ open: true, dirty: false, profileChanged: false, infoChanged: true }),
    true,
  )
  assert.equal(
    shouldRefreshPersonalDetails({ open: true, dirty: true, profileChanged: false, infoChanged: true }),
    false,
  )
  assert.equal(
    shouldRefreshPersonalDetails({ open: false, dirty: false, profileChanged: true, infoChanged: true }),
    false,
  )
})

test('a profile load does not write over a newer active profile', () => {
  assert.equal(shouldWriteProfileLoad('old', 'new'), false)
  assert.equal(shouldWriteProfileLoad('new', 'new'), true)
  assert.equal(shouldWriteProfileLoad('new', null), true)
  assert.equal(shouldWriteProfileLoad(null, 'new'), true)
})

test('an unloaded plan is loading, not a paywall or a Pro label', () => {
  assert.equal(PLAN_PENDING_LABEL, 'Loading')
  assert.equal(proFeatureMeta(null, 'Included'), 'Loading')
  assert.equal(proFeatureMeta(false, 'Included'), 'Pro feature')
  assert.equal(proFeatureMeta(true, 'Included'), 'Included')
  assert.equal(proFeatureMeta(null, ''), 'Loading')
  assert.equal(proFeatureMeta(true, ''), '')
  assert.equal(profilesRowMeta(null, 1, 'Primary'), 'Loading')
  assert.equal(profilesRowMeta(false, 1, 'Primary'), 'Pro feature')
  assert.equal(profilesRowMeta(true, 1, 'Primary'), 'Primary')
  assert.equal(profilesRowMeta(false, 2, 'Primary'), 'Primary')

  assert.equal(profilesRowAction(null, 1), 'wait')
  assert.equal(profilesRowAction(false, 1), 'paywall')
  assert.equal(profilesRowAction(true, 1), 'open')
  assert.equal(profilesRowAction(false, 3), 'open')

  assert.equal(newProfileAction(null, false), 'wait')
  assert.equal(newProfileAction(false, false), 'paywall')
  assert.equal(newProfileAction(true, false), 'create')
  assert.equal(newProfileAction(true, true), 'limit')

  assert.equal(rosterCountLabel(false, 0, 5), 'Loading')
  assert.equal(rosterCountLabel(true, 2, 5), '2 of 5')
})

test('popup wires the count, the editor refresh, and the plan gate', () => {
  const app = readFileSync(new URL('./../App.vue', import.meta.url), 'utf8')
  const vault = readFileSync(new URL('./../components/DataVault.vue', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('./../components/dialogs/UpdatePersonalInfoDialog.vue', import.meta.url), 'utf8')
  const features = readFileSync(new URL('./../components/ProFeatures.vue', import.meta.url), 'utf8')
  const modal = readFileSync(new URL('./../components/ProfilesModal.vue', import.meta.url), 'utf8')
  const loader = readFileSync(new URL('./../composables/usePersonalInfo.ts', import.meta.url), 'utf8')

  assert.match(app, /customResponseCount="customResponses\.length"/)
  assert.match(app, /:isPro="planIsPro"/)
  assert.doesNotMatch(app, /:isPro="billing\?\.isPro === true"/)
  assert.match(app, /if \(planIsPro\.value == null\) return/)
  assert.match(vault, /section\.meta\(personalInfo, counts\)/)
  assert.match(dialog, /personalDetailsForEditor/)
  assert.match(dialog, /shouldRefreshPersonalDetails/)
  assert.match(features, /profilesRowAction/)
  assert.match(features, /proFeatureMeta/)
  assert.match(modal, /newProfileAction/)
  assert.match(modal, /rosterCountLabel/)
  assert.doesNotMatch(modal, /if \(!props\.isPro\)/)
  assert.match(loader, /shouldWriteProfileLoad/)
  assert.match(loader, /noteCustomResponses/)
})
