# Dual-confirm smoke (Draft / CWS success-path)

**Scope:** Chrome Web Store **Draft** dual-confirm of the autofill success path only. Not a store publish runbook.

**Architecture:** when signed in, Supabase is the source of truth. `loadPersonalInfo()` in `src/composables/usePersonalInfo.ts` calls `fetchProfileFromDb` and then `writeMirror('personalInfo', …)` into `chrome.storage.local`. The content script (`src/content/autofill.ts`) reads that local mirror only — it does not query Supabase.

Two checks. They are not interchangeable.

**ATS order:** Greenhouse first. Ashby and Lever section-fill stay queued until Greenhouse education and experience section-fill is confirmed on a live form. This doc does not add Ashby or Lever steps.

---

## Proven vs not yet proven

The earlier mirror seed (`education: []`, `experience: []`) dual-confirmed the contact path only. `autofill_succeeded` with `ats=greenhouse` does not prove education or experience sections filled. Watch the form fields below on the next run.

### Contact-path — proven

Name, email, phone, and location-style fields, from the prior dual-confirm:

- `firstName`, `lastName`, `email`, `phone`, `phoneCountryCode` (Greenhouse phone dialing-code combobox, id `country`)
- Location-style: `address`, `city`, `state`, `zip`, `country`, and the Greenhouse city typeahead `candidate-location`

### LinkedIn — seeded, not claimed proven

The prior seed left `linkedin` empty, so that run did not show a LinkedIn fill. This fixture sets a URL. Generic field matching can fill a LinkedIn input; `src/utils/siteRules/greenhouse.ts` has no dedicated LinkedIn id. Record LinkedIn as proven only after a run shows the field filled.

### Full-profile section-fill — not yet proven

Seeded so the next Greenhouse run can check these sections. Still unproven until the form shows the values.

**Education** (`education[0]`). Greenhouse handlers in `src/utils/siteRules/greenhouse.ts` (index 0 only):

| `PersonalInfo` field | Greenhouse id | How the handler reads it |
| --- | --- | --- |
| `schoolName` | `school--0` | `schoolSearchValues` |
| `degreeType` | `degree--0` | `degreeSearchValues` (`Bachelor of Science` searches `Bachelor's Degree`) |
| `major` | `discipline--0` | `disciplineSearchValues` |
| `startYear` | `start-month--0`, `start-year--0` | Month needs a month in the string (`2016-09` → September). Year needs `YYYY`. |
| `graduationYear` | `end-month--0`, `end-year--0` | Same parsing (`2020-05` → May / 2020). |

`current` is on `Education` in `src/types/index.ts`. These handlers do not read it. The fixture sets `current: false` and a `graduationYear` so the end month/year ids have a value to search. A bare year such as `2016` fills the year input and skips the month combobox (`monthNameFromLooseDate` returns null).

**Experience** (`experience[0]`), same type names as `Experience` in `src/types/index.ts`:

- `companyName`, `jobTitle`, `startDate`, `endDate`, `present`, `description`, `locationCity`, `locationState`

Greenhouse `siteRules` have no employment ids (nothing like `company--0`). Generic `matchExperienceField` in `src/content/fieldMatch.ts` can match company, title, dates, and description when the field text hits `FIELD_PATTERNS`, and that path is not dual-confirmed. `present: false` with an `endDate` is explicit; the Greenhouse education handlers do not read experience dates.

### Resume and cover letter — not filled by Greenhouse siteRules

`greenhouse.ts` does not attach a resume or cover letter. `resumeFileName` on `PersonalInfo` is the filename shown in the UI, not a file stored in the mirror. This seed omits both. Do not record a file upload as part of this smoke.

---

## 1. Mirror-only storage seed

**Purpose:** autofill + Mixpanel property dual-confirm only.

**Not the production path.** Injecting `chrome.storage.local.personalInfo` from the service worker console skips sign-in → `fetchProfileFromDb` → `writeMirror`. Nothing is written to Supabase.

### Load unpacked

1. `npm run build` (or use an existing `dist/`)
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`

### Seed the mirror (service worker console)

1. On the extension card → **Service worker** → **Inspect**
2. Paste and run. Fields match `PersonalInfo` / `Education` / `Experience` in `src/types/index.ts` (camelCase). Copy-paste snippet:

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
    linkedin: 'https://www.linkedin.com/in/alex-smoke',
    website: '',
    github: '',
    education: [
      {
        id: 1,
        schoolName: 'University of Texas at Austin',
        degreeType: 'Bachelor of Science',
        major: 'Computer Science',
        startYear: '2016-09',
        graduationYear: '2020-05',
        current: false,
      },
    ],
    experience: [
      {
        id: 1,
        companyName: 'Northwind Labs',
        jobTitle: 'Software Engineer',
        startDate: '2020-06',
        endDate: '2024-03',
        present: false,
        description: 'Shipped internal tools used by the support team.',
        locationCity: 'Austin',
        locationState: 'TX',
      },
    ],
    skills: [],
  },
})
```

3. Verify:

```js
const { personalInfo } = await chrome.storage.local.get('personalInfo')
console.log(personalInfo)
console.log(personalInfo.education[0], personalInfo.experience[0])
```

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid` (`job-boards.greenhouse.io` or `boards.greenhouse.io`).
2. Trigger autofill.
3. In the **same service worker** DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.
4. On the form, check section-fill separately from that event:
   - Education: `school--0`, `degree--0`, `discipline--0`, `start-month--0`, `start-year--0`, `end-month--0`, `end-year--0`
   - Experience: company, title, dates, description, and city/state if the board shows them
   - Leave resume and cover letter unchecked; Greenhouse site rules do not fill those files

Contact fields (name, email, phone, location-style) are the proven path. Education and experience stay **not yet proven** until this form check passes.

### Empty-profile reset

```js
await chrome.storage.local.set({ personalInfo: {} })
```

---

## 2. Supabase path dual-confirm

**Purpose:** confirm the production architecture — signed-in profile from Supabase is mirrored locally, then autofilled.

This path is not the mirror-only seed in section 1. A signed-in profile whose remote `education` and `experience` arrays are empty still cannot prove Greenhouse section-fill.

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
console.log(personalInfo.education, personalInfo.experience)
```

If this mirror shows `Alex` / `alex.smoke@example.com`, the popup did not replace the section 1 seed. Section-fill on the form follows whatever education and experience rows Supabase returned, which may differ from the fixture above.

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid`.
2. Trigger autofill.
3. In the service worker DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.

Same split as section 1: that event confirms the contact success path. Education ids (`school--0`, `degree--0`, `discipline--0`, `start-month--0`, `start-year--0`, `end-month--0`, `end-year--0`) and experience fields are section-fill and stay unproven until the form shows them. Greenhouse site rules still do not attach a resume or cover letter.
