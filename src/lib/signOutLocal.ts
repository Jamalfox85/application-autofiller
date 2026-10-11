// Keys removed on sign-out. The local profile is a mirror of the signed-in
// account; the next person on this browser must not see it. Onboarding
// completion is in that set too: a leftover profileSetupCompletedAt used to
// let a different account skip Welcome.
import { USER_ID_KEY } from '../services/billing/entitlementStore.ts'
import { PROFILE_SETUP_STORAGE_KEYS } from '../services/profileSetupSession.ts'

export const SIGN_OUT_LOCAL_KEYS = [
  'personalInfo',
  'customResponses',
  'fillHistory',
  'resumeUploadJob',
  'savedResumeFile',
  'localToSupabaseMigrated_v1',
  'activeProfile',
  USER_ID_KEY,
  ...PROFILE_SETUP_STORAGE_KEYS,
] as const
