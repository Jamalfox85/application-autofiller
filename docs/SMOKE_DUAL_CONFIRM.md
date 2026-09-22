# Dual-confirm smoke (Draft / CWS success-path)

**Scope:** Chrome Web Store **Draft** dual-confirm of the autofill success path only. Not a store publish runbook.

Google OAuth on unpacked builds often hits `redirect_uri_mismatch` because the extension ID (and thus the chromiumapp.org redirect) changes per load path. Prefer seeding `chrome.storage.local.personalInfo` directly — the frontend already supports that without OAuth.

Fields below match `PersonalInfo` in `src/types/index.ts` (camelCase).

---

## 1. Preferred: non-OAuth profile seed

### Load unpacked

1. `npm run build` (or use an existing `dist/`)
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`

### Seed profile (service worker console)

1. On the extension card → **Service worker** → **Inspect**
2. Paste and run:

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

1. Open a Carvana Greenhouse apply URL that includes `gh_jid` (e.g. a `job-boards.greenhouse.io` / `boards.greenhouse.io` Carvana job apply page).
2. Trigger autofill as usual.
3. In the **same service worker** DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.

### Empty-profile reset

```js
await chrome.storage.local.set({ personalInfo: {} })
```

---

## 2. Optional: OAuth unpack redirect URI

Auth builds the Google redirect with `chrome.identity.getRedirectURL()` and **no path** (`src/lib/auth.ts`):

```text
https://<EXTENSION_ID>.chromiumapp.org/
```

Unpacked extension IDs change when the load path changes, so that URI must be re-registered in the Google OAuth client for each new ID. **Prefer the storage seed above for Draft dual-confirm smoke** instead of fighting OAuth.
