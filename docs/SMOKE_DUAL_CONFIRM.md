# Dual-confirm smoke (Draft / CWS success-path)

**Scope:** Chrome Web Store **Draft** dual-confirm of the autofill success path only. Not a store publish runbook.

**Architecture:** when signed in, Supabase is the source of truth. `loadPersonalInfo()` in `src/composables/usePersonalInfo.ts` calls `fetchProfileFromDb` and then `writeMirror('personalInfo', …)` into `chrome.storage.local`. The content script (`src/content/autofill.ts`) reads that local mirror only — it does not query Supabase.

Two checks. They are not interchangeable.

---

## 1. Mirror-only storage seed

**Purpose:** autofill + Mixpanel property dual-confirm only.

**Not the production path.** Injecting `chrome.storage.local.personalInfo` from the service worker console skips sign-in → `fetchProfileFromDb` → `writeMirror`. Nothing is written to Supabase.

### Load unpacked

1. `npm run build` (or use an existing `dist/`)
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`

### Seed the mirror (service worker console)

1. On the extension card → **Service worker** → **Inspect**
2. Paste and run. Fields match `PersonalInfo` in `src/types/index.ts` (camelCase):

```js
await chrome.storage.local.set({
  personalInfo: {
    firstName: 'Alex',
    lastName: 'Smoke',
    email: 'alex.smoke@example.com',
    phone: '5551234567',
    phoneCountryCode: '+1',
    address: '123 Test St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'United States',
    linkedin: '',
    website: '',
    github: '',
    education: [],
    experience: [],
    skills: [],
  },
})
```

3. Verify:

```js
const { personalInfo } = await chrome.storage.local.get('personalInfo')
console.log(personalInfo)
```

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid` (`job-boards.greenhouse.io` or `boards.greenhouse.io`).
2. Trigger autofill.
3. In the **same service worker** DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.

### Empty-profile reset

```js
await chrome.storage.local.set({ personalInfo: {} })
```

---

## 2. Supabase path dual-confirm

**Purpose:** confirm the production architecture — signed-in profile from Supabase is mirrored locally, then autofilled.

### Sign in

Either:

- Google OAuth. Auth uses `chrome.identity.getRedirectURL()` with no path (`src/lib/auth.ts`). Register this exact URI on the OAuth client:

```text
https://<EXTENSION_ID>.chromiumapp.org/
```

Unpacked extension IDs change when the load path changes, so a new unpack needs the URI re-registered, or

- Restore an existing session on a **stable** unpacked id (same load path as the session that signed in).

### Hydrate the mirror from Supabase

1. Open the popup so `loadPersonalInfo()` runs.
2. Signed in, that fetches the profile (`fetchProfileFromDb`) and writes the mirror (`writeMirror('personalInfo', …)`).

### Verify the mirror is the remote row

In the service worker console, read the mirror and compare it to the known Supabase profile (for example `firstName` and `email` from the remote row). Those values must match the database, not the mirror-only smoke seed from section 1 (`Alex` / `alex.smoke@example.com`).

```js
const { personalInfo } = await chrome.storage.local.get('personalInfo')
console.log(personalInfo.firstName, personalInfo.email)
```

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid`.
2. Trigger autofill.
3. In the service worker DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.
