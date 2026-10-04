// Downloads the signed-in user's resume from the private `resumes` bucket.
// The content script asks for this during a Workable fill. It never receives a
// storage path from the page: the path is profiles.resume_file_path for the
// session user. No stored object means there is no file to attach.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chromeLocalStorage } from '../lib/chromeLocalStorage.ts'
import { supabasePublicConfigError } from '../lib/supabaseConfig.ts'
import {
  savedResumeFromStored,
  savedResumeWireMessage,
  type SavedResumeWireMessage,
} from '../utils/siteRules/workableResume.ts'

let client: SupabaseClient | null = null

function workerSupabase(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (supabasePublicConfigError(url, anonKey) || !url || !anonKey) return null
  client = createClient(url, anonKey, {
    auth: {
      storage: chromeLocalStorage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
    },
  })
  return client
}

export async function loadSavedResumeInWorker(): Promise<SavedResumeWireMessage> {
  const supabase = workerSupabase()
  if (!supabase) return { ok: false }
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id
    if (sessionError || !userId) return { ok: false }

    const { data, error } = await supabase
      .from('profiles')
      .select('resume_file_path, resume_file_name')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return { ok: false }

    const filePath = typeof data.resume_file_path === 'string' ? data.resume_file_path.trim() : ''
    if (!filePath) return { ok: false }

    const downloaded = await supabase.storage.from('resumes').download(filePath)
    if (downloaded.error || !downloaded.data) return { ok: false }

    const saved = savedResumeFromStored({
      filePath,
      fileName: typeof data.resume_file_name === 'string' ? data.resume_file_name : '',
      bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
      mimeType: downloaded.data.type,
    })
    if (!saved) return { ok: false }
    return savedResumeWireMessage(saved)
  } catch (error) {
    console.error('[saved-resume] could not load the stored resume', error)
    return { ok: false }
  }
}
