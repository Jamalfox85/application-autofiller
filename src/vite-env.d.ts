interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_POSTHOG_API_KEY: string
  readonly VITE_POSTHOG_API_HOST: string
  // Base URL of the Go resume API, including /api/v1. Defaults to http://localhost:8080/api/v1.
  readonly VITE_RESUME_API_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
