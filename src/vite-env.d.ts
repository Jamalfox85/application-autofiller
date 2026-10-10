interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_POSTHOG_API_KEY: string
  readonly VITE_POSTHOG_API_HOST: string
  // 'test' | 'production'. Unset uses install detection. Release builds reject 'test'.
  readonly VITE_BUILD_CHANNEL: string
  // Base URL of the Go resume API, including /api/v1. Required for release builds (no localhost).
  readonly VITE_RESUME_API_URL: string
  readonly VITE_RESUME_API_KEY: string
  readonly VITE_EXTENSIONPAY_EXTENSION_ID: string
  readonly VITE_MATCH_SCORE_ENABLED: string
  readonly VITE_MATCH_SCORE_GREENHOUSE: string
  readonly VITE_MATCH_SCORE_ASHBY: string
  readonly VITE_MATCH_SCORE_LEVER: string
  readonly VITE_MATCH_SCORE_JOBVITE: string
  readonly VITE_MATCH_SCORE_WORKABLE: string
  readonly VITE_MATCH_SCORE_BAMBOOHR: string
  readonly VITE_MATCH_SCORE_ICIMS: string
  readonly VITE_MATCH_SCORE_WORKDAY: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
