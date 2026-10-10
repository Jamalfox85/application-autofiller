// Analytics build stamp. Every Mixpanel and PostHog event carries this as
// build_channel. It is never null.
//
// A Chrome Web Store install always resolves to "production": installType
// "normal", or (when the management API is unavailable) a manifest update_url.
// Chrome injects update_url for store installs. This wins over VITE_BUILD_CHANNEL
// so a test stamp cannot label store traffic as test.
//
// Otherwise, in order:
// 1. VITE_BUILD_CHANNEL when it is exactly "test" or "production" (after trim).
// 2. Unpacked install → "test". Prefer chrome.management.getSelf().installType
//    === "development" when that call works. This extension does not request
//    the management permission; when the API is missing or throws, an unpacked
//    install is a manifest with no update_url.
// 3. Otherwise "production".
//
// Release builds also refuse VITE_BUILD_CHANNEL=test.

export type BuildChannelName = 'test' | 'production'

export type BuildChannelProbe = {
  management?: {
    getSelf?: () => Promise<{ installType?: string }>
  }
  runtime?: {
    getManifest?: () => { update_url?: string }
  }
}

export function explicitBuildChannel(value: unknown): BuildChannelName | null {
  if (typeof value !== 'string') return null
  const channel = value.trim()
  if (channel === 'test' || channel === 'production') return channel
  return null
}

/** development → test. Any other reported install type is not an unpacked load. */
export function buildChannelFromInstallType(installType: unknown): BuildChannelName | null {
  if (typeof installType !== 'string' || installType.length === 0) return null
  return installType === 'development' ? 'test' : 'production'
}

export function manifestHasUpdateUrl(manifest: { update_url?: string } | null | undefined): boolean {
  return typeof manifest?.update_url === 'string' && manifest.update_url.trim() !== ''
}

/**
 * Manifest present and no update_url → unpacked → test.
 * update_url set → not unpacked (Chrome Web Store and other auto-updating
 * packages) → production.
 * No manifest object at all is not evidence of an unpacked install.
 */

export function buildChannelFromManifest(
  manifest: { update_url?: string } | null | undefined,
): BuildChannelName {
  if (manifest == null) return 'production'
  return manifestHasUpdateUrl(manifest) ? 'production' : 'test'
}

/**
 * Store installs are production even when VITE_BUILD_CHANNEL=test.
 * installType "development" is unpacked, not the store, even if a manifest
 * double also carries update_url. Without the management API, any update_url
 * is the store/auto-update signal (unpacked loads have none).
 */
export function isChromeWebStoreInstall(input: {
  managementAvailable: boolean
  installType?: unknown
  manifest?: { update_url?: string } | null
}): boolean {
  if (input.managementAvailable && input.installType === 'normal') return true
  if (input.managementAvailable && input.installType === 'development') return false
  if (!input.managementAvailable && manifestHasUpdateUrl(input.manifest)) return true
  return false
}

export function decideBuildChannel(input: {
  env?: unknown
  managementAvailable: boolean
  installType?: unknown
  /** undefined = manifest was not read. null = read failed / empty. */
  manifest?: { update_url?: string } | null
}): BuildChannelName {
  if (isChromeWebStoreInstall(input)) return 'production'

  const fromEnv = explicitBuildChannel(input.env)
  if (fromEnv) return fromEnv

  if (input.managementAvailable) {
    const fromInstall = buildChannelFromInstallType(input.installType)
    if (fromInstall) return fromInstall
  }

  if (input.manifest === undefined) return 'production'
  return buildChannelFromManifest(input.manifest)
}

export async function resolveBuildChannel(
  env: unknown,
  api?: BuildChannelProbe | null,
): Promise<BuildChannelName> {
  let managementAvailable = false
  let installType: string | undefined
  if (api?.management && typeof api.management.getSelf === 'function') {
    try {
      const info = await api.management.getSelf()
      if (info && typeof info.installType === 'string' && info.installType.length > 0) {
        managementAvailable = true
        installType = info.installType
      }
    } catch {
      // Permission missing, or the call failed. Fall through to the manifest.
      managementAvailable = false
    }
  }

  let manifest: { update_url?: string } | null | undefined
  if (api?.runtime && typeof api.runtime.getManifest === 'function') {
    try {
      manifest = api.runtime.getManifest() ?? null
    } catch {
      manifest = null
    }
  }

  return decideBuildChannel({ env, managementAvailable, installType, manifest })
}

function readConfiguredBuildChannel(): unknown {
  try {
    // Direct member access so Vite and the service-worker esbuild define inline it.
    return import.meta.env.VITE_BUILD_CHANNEL
  } catch {
    return undefined
  }
}

function currentChrome(): BuildChannelProbe | undefined {
  if (typeof chrome === 'undefined') return undefined
  return chrome as unknown as BuildChannelProbe
}

let cached: Promise<BuildChannelName> | null = null

export function extensionBuildChannel(): Promise<BuildChannelName> {
  if (!cached) {
    cached = resolveBuildChannel(readConfiguredBuildChannel(), currentChrome())
  }
  return cached
}
