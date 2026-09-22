import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_BUILD_ENV_MESSAGE, supabasePublicConfigError } from './supabaseConfig'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Null when this build cannot talk to Supabase. The popup reads this and renders
// a setup message. Do not call createClient in that case: it throws during
// module init and the popup stays a blank white page.
export const supabaseConfigError = supabasePublicConfigError(SUPABASE_URL, SUPABASE_ANON_KEY)

function createSupabase(): SupabaseClient {
  if (supabaseConfigError || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(SUPABASE_BUILD_ENV_MESSAGE)
      },
    })
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Chrome extensions can't use localStorage — use this instead
      storage: {
        getItem: (key) =>
          new Promise((resolve) =>
            chrome.storage.local.get(key, (res) => resolve(res[key] ?? null)),
          ),
        setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
        removeItem: (key) => chrome.storage.local.remove(key),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Important: disable for extensions
    },
  })
}

export const supabase = createSupabase()
