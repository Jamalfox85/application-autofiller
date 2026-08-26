import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Chrome extensions can't use localStorage — use this instead
    storage: {
      getItem: (key) =>
        new Promise((resolve) => chrome.storage.local.get(key, (res) => resolve(res[key] ?? null))),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important: disable for extensions
  },
})
