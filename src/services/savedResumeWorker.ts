// Background download of the resume the user already uploaded. The content
// script cannot read the private bucket itself; it asks for this payload and
// assigns the file on a plain input[type=file]. Nothing here clicks or submits.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chromeLocalStorage } from '../lib/chromeLocalStorage.ts'
import { supabasePublicConfigError } from '../lib/supabaseConfig.ts'
import {
  readSavedResume,
  savedResumeMessage,
  type ResumeStorageClient,
  type SavedResumeMessage,
} from './savedResume.ts'

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

function storageClient(supabase: SupabaseClient): ResumeStorageClient {
  return {
    async userId() {
      const { data } = await supabase.auth.getSession()
      return data.session?.user?.id ?? null
    },
    async profileResume(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('resume_file_name, resume_file_path')
        .eq('id', userId)
        .maybeSingle()
      if (error || !data) return null
      const path = typeof data.resume_file_path === 'string' ? data.resume_file_path : ''
      const fileName = typeof data.resume_file_name === 'string' ? data.resume_file_name : ''
      if (!path) return null
      return { fileName, path }
    },
    async download(path) {
      const { data, error } = await supabase.storage.from('resumes').download(path)
      if (error || !data) return null
      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        mimeType: data.type || '',
      }
    },
  }
}

export async function readSavedResumeMessage(): Promise<SavedResumeMessage> {
  try {
    const supabase = workerSupabase()
    if (!supabase) return { ok: false }
    return savedResumeMessage(await readSavedResume(storageClient(supabase)))
  } catch (error) {
    console.error('[saved-resume] could not read the uploaded resume', error)
    return { ok: false }
  }
}
