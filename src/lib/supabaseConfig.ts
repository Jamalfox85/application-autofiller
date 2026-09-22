// Build-time public Supabase settings. Vite inlines import.meta.env.VITE_* at
// `npm run build`. A missing value becomes the JS value undefined, and
// @supabase/supabase-js then throws "supabaseUrl is required." while the popup
// module is still evaluating — before createApp().mount() — so the panel stays
// the browser's default white page.

export const SUPABASE_BUILD_ENV_MESSAGE =
  'This build is missing Supabase settings. Copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your project values, then run npm run build again.'

const PLACEHOLDER_HOSTS = new Set(['your-project-ref.supabase.co'])
const PLACEHOLDER_KEYS = new Set(['your-anon-key', 'your-publishable-key'])

export function supabasePublicConfigError(url: unknown, anonKey: unknown): string | null {
  const urlText = typeof url === 'string' ? url.trim() : ''
  const keyText = typeof anonKey === 'string' ? anonKey.trim() : ''

  let urlOk = false
  try {
    const parsed = new URL(urlText)
    urlOk =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !PLACEHOLDER_HOSTS.has(parsed.hostname)
  } catch {
    urlOk = false
  }

  const keyOk = keyText.length > 0 && !PLACEHOLDER_KEYS.has(keyText)
  if (urlOk && keyOk) return null
  return SUPABASE_BUILD_ENV_MESSAGE
}
