import { ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { getStoredSession, onAuthStateChanged, signOut as signOutOfSupabase } from '@/lib/auth'
import { isSupabaseAuthStorageKey } from '@/lib/googleAuth'
import { USER_ID_KEY } from '@/services/billing/entitlementStore'
import { flushPendingProfilePlan } from '@/services/billing/profilePlan'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

// Module-level (not per-call) state: every component that calls useAuth() shares one auth
// session for the popup's lifetime, so a sign-out from the header updates the gate view too.
const status = ref<AuthStatus>('loading')
const session = ref<Session | null>(null)
const user = ref<User | null>(null)
const isSigningIn = ref(false)
const signInError = ref('')

let unsubscribe: (() => void) | null = null

function applySession(next: Session | null) {
  session.value = next
  user.value = next?.user ?? null
  status.value = next ? 'signed-in' : 'signed-out'
  try {
    if (next?.user?.id) {
      void chrome.storage.local.set({ [USER_ID_KEY]: next.user.id })
      void flushPendingProfilePlan()
    } else {
      void chrome.storage.local.remove(USER_ID_KEY)
    }
  } catch {
    // Billing identity is popup bookkeeping. Auth itself already applied.
  }
}

// The worker writes the Supabase session after this popup may already have
// initialized as signed-out. onAuthStateChange does not cross extension
// contexts, so a storage write is what flips an open popup to signed-in.
function onStoredSessionChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: chrome.storage.AreaName,
) {
  if (areaName !== 'local') return
  if (status.value === 'signed-in') return
  const wroteSession = Object.entries(changes).some(
    ([key, change]) => isSupabaseAuthStorageKey(key) && change.newValue != null,
  )
  if (!wroteSession) return
  void getStoredSession().then(applySession)
}

export function useAuth() {
  // Safe to call from every component that mounts useAuth — subscribes once per popup load.
  const initAuth = async () => {
    if (!unsubscribe) {
      unsubscribe = onAuthStateChanged(applySession)
      chrome.storage.onChanged.addListener(onStoredSessionChanged)
    }
    applySession(await getStoredSession())
  }

  // launchWebAuthFlow runs in the service worker. Calling it here opens the
  // Google window, Chrome closes this popup, and the callback is cancelled
  // before a session can be stored. If this document is still alive when the
  // worker finishes, read the session it persisted; if the popup was torn
  // down, the next open loads that session in initAuth.
  const signIn = async () => {
    isSigningIn.value = true
    signInError.value = ''
    try {
      const response = (await chrome.runtime.sendMessage({ action: 'signInWithGoogle' })) as
        | { ok?: boolean; error?: string }
        | undefined
      if (!response?.ok) {
        signInError.value = response?.error || 'Sign-in failed. Please try again.'
        return
      }
      applySession(await getStoredSession())
    } catch (error) {
      signInError.value = error instanceof Error ? error.message : 'Sign-in failed. Please try again.'
    } finally {
      isSigningIn.value = false
    }
  }

  const signOut = async () => {
    await signOutOfSupabase()
    // Drop the local mirrors so the next person to sign in on this browser never sees the
    // previous account's data, even for a frame. Supabase is the source of truth; these are
    // rebuilt on the next load.
    await chrome.storage.local.remove([
      'personalInfo',
      'customResponses',
      'fillHistory',
      'resumeUploadJob',
      'localToSupabaseMigrated_v1',
      USER_ID_KEY,
    ])
    applySession(null)
  }

  return {
    status,
    session,
    user,
    isSigningIn,
    signInError,
    initAuth,
    signIn,
    signOut,
  }
}
