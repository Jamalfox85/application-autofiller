import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decideBuildChannel,
  explicitBuildChannel,
  resolveBuildChannel,
} from './buildChannel.ts'
import { finalizeTrackedProperties } from './mixpanelConfig.ts'

const STORE_UPDATE_URL = 'https://clients2.google.com/service/update2/crx'

test('explicit channel accepts only test and production', () => {
  assert.equal(explicitBuildChannel('test'), 'test')
  assert.equal(explicitBuildChannel(' production '), 'production')
  assert.equal(explicitBuildChannel(''), null)
  assert.equal(explicitBuildChannel('staging'), null)
  assert.equal(explicitBuildChannel('Test'), null)
  assert.equal(explicitBuildChannel(null), null)
})

test('a store-like manifest yields production and an unpacked one yields test', () => {
  const unpacked = JSON.parse(readFileSync('manifest.json', 'utf8')) as {
    update_url?: string
    permissions: string[]
  }
  assert.equal(unpacked.update_url, undefined)
  assert.equal(unpacked.permissions.includes('management'), false)

  assert.equal(decideBuildChannel({ managementAvailable: false, manifest: unpacked }), 'test')
  assert.equal(
    decideBuildChannel({
      managementAvailable: false,
      manifest: { ...unpacked, update_url: STORE_UPDATE_URL },
    }),
    'production',
  )
})

test('a Chrome Web Store install stays production even when VITE_BUILD_CHANNEL=test', () => {
  assert.equal(
    decideBuildChannel({
      env: 'test',
      managementAvailable: false,
      manifest: { update_url: STORE_UPDATE_URL },
    }),
    'production',
  )
  assert.equal(
    decideBuildChannel({
      env: 'test',
      managementAvailable: true,
      installType: 'normal',
      manifest: { version: '2.0.0' },
    }),
    'production',
  )
})

test('an unpacked install is test, and VITE_BUILD_CHANNEL can force production there', () => {
  const unpacked = { version: '2.0.0' }
  assert.equal(decideBuildChannel({ managementAvailable: false, manifest: unpacked }), 'test')
  assert.equal(
    decideBuildChannel({
      managementAvailable: true,
      installType: 'development',
      manifest: unpacked,
    }),
    'test',
  )
  // development wins over a stray update_url: that install is unpacked, not the store.
  assert.equal(
    decideBuildChannel({
      managementAvailable: true,
      installType: 'development',
      manifest: { update_url: STORE_UPDATE_URL },
    }),
    'test',
  )
  assert.equal(
    decideBuildChannel({
      env: 'test',
      managementAvailable: true,
      installType: 'development',
    }),
    'test',
  )
  assert.equal(
    decideBuildChannel({
      env: 'production',
      managementAvailable: false,
      manifest: unpacked,
    }),
    'production',
  )
})

test('sideload and admin installs are production unless the env forces test', () => {
  assert.equal(
    decideBuildChannel({ managementAvailable: true, installType: 'sideload' }),
    'production',
  )
  assert.equal(
    decideBuildChannel({ managementAvailable: true, installType: 'admin' }),
    'production',
  )
  assert.equal(
    decideBuildChannel({
      env: 'test',
      managementAvailable: true,
      installType: 'sideload',
    }),
    'test',
  )
})

test('missing install evidence resolves to production', () => {
  assert.equal(decideBuildChannel({ managementAvailable: false }), 'production')
  assert.equal(decideBuildChannel({ managementAvailable: false, manifest: null }), 'production')
  assert.equal(
    decideBuildChannel({ managementAvailable: true, installType: '', manifest: null }),
    'production',
  )
})

test('resolveBuildChannel uses installType, then the manifest when management fails', async () => {
  assert.equal(
    await resolveBuildChannel('test', {
      management: { getSelf: async () => ({ installType: 'normal' }) },
      runtime: { getManifest: () => ({}) },
    }),
    'production',
  )
  assert.equal(
    await resolveBuildChannel(undefined, {
      management: { getSelf: async () => ({ installType: 'development' }) },
      runtime: { getManifest: () => ({ update_url: STORE_UPDATE_URL }) },
    }),
    'test',
  )
  assert.equal(
    await resolveBuildChannel(undefined, {
      management: {
        getSelf: async () => {
          throw new Error('Cannot access a chrome:// URL')
        },
      },
      runtime: { getManifest: () => ({ update_url: STORE_UPDATE_URL }) },
    }),
    'production',
  )
  assert.equal(
    await resolveBuildChannel(undefined, {
      runtime: { getManifest: () => ({ name: 'GoFillr', version: '2.0.0' }) },
    }),
    'test',
  )
  assert.equal(
    await resolveBuildChannel('production', {
      runtime: { getManifest: () => ({ name: 'GoFillr' }) },
    }),
    'production',
  )
  assert.equal(await resolveBuildChannel(undefined, null), 'production')
})

test('time_to_first_fill_ms is attached only when is_first_fill is true', () => {
  const first = finalizeTrackedProperties(
    { is_first_fill: true, time_to_first_fill_ms: 0, ats: 'lever', note: '' },
    'test',
  )
  assert.equal(first.time_to_first_fill_ms, 0)
  assert.equal(first.is_first_fill, true)
  assert.equal(first.build_channel, 'test')
  assert.equal('note' in first, false)

  const later = finalizeTrackedProperties(
    { is_first_fill: false, time_to_first_fill_ms: 45_000, build_channel: null },
    'production',
  )
  assert.equal(later.is_first_fill, false)
  assert.equal('time_to_first_fill_ms' in later, false)
  assert.equal(later.build_channel, 'production')

  const replaced = finalizeTrackedProperties(
    { build_channel: 'draft', is_first_fill: false, time_to_first_fill_ms: 1 },
    'production',
  )
  assert.equal(replaced.build_channel, 'production')
  assert.equal('time_to_first_fill_ms' in replaced, false)

  const cws = finalizeTrackedProperties({ build_channel: 'cws' }, 'test')
  assert.equal(cws.build_channel, 'test')
})

test('Mixpanel senders attach the stamp, including events that moved off PostHog', () => {
  const read = (path: string) => readFileSync(path, 'utf8')
  const popup = read('src/services/mixpanel.ts')
  const http = read('src/services/mixpanelHttp.ts')
  const background = read('background.js')
  const manifest = read('manifest.json')
  const emit = read('scripts/emit-install-attribution.mjs')
  const pick = read('src/components/onboarding/PickPath.vue')
  const welcome = read('src/components/Welcome.vue')
  const index = read('src/content/index.js')
  const telemetry = read('src/services/fillTelemetry.ts')

  assert.equal(existsSync('src/services/posthog.ts'), false)
  assert.match(popup, /finalizeTrackedProperties\(/)
  assert.match(http, /finalizeTrackedProperties\(/)
  assert.match(background, /finalizeTrackedProperties\(/)
  assert.match(background, /extensionSuperProperties/)
  assert.match(background, /const MIXPANEL_TOKEN = '631d1b855c22a921118ebbe7bdcafedb'/)
  assert.match(read('src/services/mixpanelConfig.ts'), /export const MIXPANEL_TOKEN = '631d1b855c22a921118ebbe7bdcafedb'/)
  assert.match(pick, /from '@\/services\/mixpanel'/)
  assert.match(pick, /trackEvent\('resume_upload_started'/)
  assert.match(pick, /trackEvent\('onboarding_started'/)
  assert.match(welcome, /from '@\/services\/mixpanel'/)
  assert.match(welcome, /trackEvent\('resume_upload_succeeded'/)
  assert.match(welcome, /trackEvent\('resume_upload_failed'/)
  assert.match(welcome, /trackEvent\('profile_completed'/)
  assert.match(index, /from '\.\.\/services\/mixpanelHttp'/)
  assert.match(index, /trackEvent\('application_submitted'/)
  assert.match(telemetry, /from '\.\/mixpanelHttp'/)
  assert.match(telemetry, /void trackEvent\(event, properties\)/)
  assert.doesNotMatch(`${pick}\n${welcome}\n${index}\n${telemetry}`, /captureEvent|posthog/i)
  assert.equal(manifest.includes('"management"'), false)
  assert.equal(/posthog/i.test(manifest), false)
  assert.equal(/posthog/i.test(read('package.json')), false)
  assert.match(emit, /import\.meta\.env\.VITE_BUILD_CHANNEL/)
  assert.match(emit, /entryPoints: \['src\/services\/mixpanelConfig\.ts'\]/)
})
