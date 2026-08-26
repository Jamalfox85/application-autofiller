import { ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import {
  getStoredSession,
  onAuthStateChanged,
  signInWithGoogle,
  signOut as signOutOfSupabase,
} from '@/lib/auth'

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
}

export function useAuth() {
  // Safe to call from every component that mounts useAuth — subscribes once per popup load.
  const initAuth = async () => {
    if (!unsubscribe) {
      unsubscribe = onAuthStateChanged(applySession)
    }
    applySession(await getStoredSession())
  }

  const signIn = async () => {
    isSigningIn.value = true
    signInError.value = ''
    try {
      const { session: newSession } = await signInWithGoogle()
      applySession(newSession)
    } catch (error) {
      signInError.value = error instanceof Error ? error.message : 'Sign-in failed. Please try again.'
    } finally {
      isSigningIn.value = false
    }
  }

  const signOut = async () => {
    await signOutOfSupabase()
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
