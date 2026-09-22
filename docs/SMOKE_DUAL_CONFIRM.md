# Dual-confirm smoke (Draft / CWS success-path)

**Scope:** Chrome Web Store **Draft** dual-confirm of the autofill success path only. Not a store publish runbook.

**Architecture:** when signed in, Supabase is the source of truth. `loadPersonalInfo()` in `src/composables/usePersonalInfo.ts` calls `fetchProfileFromDb` and then `writeMirror('personalInfo', …)` into `chrome.storage.local`. The content script (`src/content/autofill.ts`) reads that local mirror only — it does not query Supabase.

Two checks. They are not interchangeable.

**ATS order:** Greenhouse first. Ashby and Lever section-fill stay queued until Greenhouse education and experience section-fill is confirmed on a live form. This doc does not add Ashby or Lever steps.

---

## Greenhouse must-haves (proven vs not yet proven)

The earlier mirror seed (`education: []`, `experience: []`, no `workAuthorization`, no `resumeFileName`) dual-confirmed the contact path only. `autofill_succeeded` with `ats=greenhouse` does not prove the other rows. Watch the form on the next run.

| Must-have | Seed | Status |
| --- | --- | --- |
| Contact: name, email, phone, location, LinkedIn | `firstName`, `lastName`, `email`, `phone`, `phoneCountryCode`, `address`, `city`, `state`, `zip`, `country`, `linkedin` | **Proven:** name, email, phone, location-style (`country` dialing-code combobox, `candidate-location`). **Not yet proven:** `linkedin` (prior seed was empty; `greenhouse.ts` has no LinkedIn id). |
| Experience: 2 roles | `experience[0]`, `experience[1]` | **Not yet proven.** No Greenhouse employment ids in `src/utils/siteRules/greenhouse.ts`. Generic `matchExperienceField` reads `experience[0]` only. |
| Education: 2 entries | `education[0]`, `education[1]` | **Not yet proven.** Handlers read `education[0]` only. |
| Work authorization and sponsorship | `workAuthorization`, `sponsorshipRequired` | **Not yet proven.** Handlers exist; the prior seed omitted both keys. |
| Resume filename | `resumeFileName` | **Filename is set. Binary attach may still be skipped.** `greenhouse.ts` does not upload a file. |
| EEO (optional) | `eeoAnswersEnabled`, `gender`, `raceEthnicity`, `veteranStatus`, `disabilityStatus` | **Attempted, not a must-have.** Fill when the vault has values and the question text matches. Missing or unmapped questions are skipped and non-blocking. This does not gate the experience gap. |

### Contact — proven (except LinkedIn)

- `firstName`, `lastName`, `email`, `phone`, `phoneCountryCode` (Greenhouse phone dialing-code combobox, id `country`)
- Location-style: `address`, `city`, `state`, `zip`, `country`, and the Greenhouse city typeahead `candidate-location`
- `linkedin` is in this seed. Record it proven only after a run shows the field filled.

### Experience — 2 roles, not yet proven

Both rows use `Experience` keys from `src/types/index.ts`: `companyName`, `jobTitle`, `startDate`, `endDate` or `present`, `description`, `locationCity`, `locationState`.

- `experience[0]` is the current role (`present: true`, no `endDate`).
- `experience[1]` is a past role (`present: false`, `endDate` set).

Greenhouse site rules have no employment ids. A fill of the first role through generic field matching would still leave the second role unproven.

That employment gap outranks EEO. EEO is an optional attempt on the same run. A skipped gender, race, veteran, or disability control does not block work on these two roles.

### Education — 2 entries, not yet proven

`education[0]` is what `src/utils/siteRules/greenhouse.ts` reads:

| `PersonalInfo` field | Greenhouse id | How the handler reads it |
| --- | --- | --- |
| `schoolName` | `school--0` | `schoolSearchValues` |
| `degreeType` | `degree--0` | `degreeSearchValues` (`Bachelor of Science` searches `Bachelor's Degree`) |
| `major` | `discipline--0` | `disciplineSearchValues` |
| `startYear` | `start-month--0`, `start-year--0` | Month needs a month in the string (`2016-09` → September). Year needs `YYYY`. |
| `graduationYear` | `end-month--0`, `end-year--0` | Same parsing (`2020-05` → May / 2020). |

`current` is on `Education`. These handlers do not read it. A bare year such as `2016` fills the year input and skips the month combobox.

`education[1]` is in the seed (Master's). Site rules have no `school--1` / `degree--1` ids, so the second entry is not wired.

### Work authorization and sponsorship — not yet proven

Stored values, not display sentences. The profile editor (`UpdateOtherInfoDialog.vue`) saves `workAuthorization: 'authorized_no_sponsorship'` with the label "Authorized, no sponsorship needed", and `sponsorshipRequired: 'No'`.

Greenhouse matches question text (`legallyauthorized` / `authorizedtowork`, and `sponsorship`) on a `question_*` id. Those handlers treat `authorized_no_sponsorship` as authorized and `sponsorshipRequired: 'No'` as no sponsorship. A free-text value such as "Authorized to work in the US" is not in that list.

### Resume filename — set; file attach may be skipped

`resumeFileName` is `ada-lovelace-resume.pdf`. That key is the filename shown in the UI. The mirror seed has no file bytes, and `greenhouse.ts` has no resume or cover-letter upload handler. On the form, expect the filename field only if some other matcher writes the string. The binary file control can stay empty. Do not record an attachment as part of this smoke until a run shows the file attached.

### EEO — optional, attempted

Not a must-have. When the mirror has values and `eeoAnswersEnabled` is true, `reactSelectEeoFieldHandlers` in `src/utils/siteRules/eeoHandlers.ts` attempts Greenhouse EEO dropdowns. This seed sets the stored keys:

| Key | Seed | Labels the handler searches |
| --- | --- | --- |
| `eeoAnswersEnabled` | `true` | Handlers run. `false` skips every EEO handler. |
| `gender` | `female` | Female, Woman |
| `raceEthnicity` | `white` | White, on `hispanicethnicityareyouhispanic` (then `#race`) or `identifymyraceas` |
| `veteranStatus` | `not_a_veteran` | "No, I am not a veteran", "I am not a protected veteran" |
| `disabilityStatus` | `no` | "No", "No, I do not have a disability and have not had one in the past" |

Attempt EEO when the vault has these values. If the board omits the question, or the label does not match `gender`, `hispanicethnicityareyouhispanic`, `identifymyraceas`, `veteranstatus`, or `disability`, leave that control skipped. The skip is non-blocking. Unmapped react-selects are also left alone by the `select__input` catch-all in the same file.

### Out of v1

Essays, referrals, and portfolio beyond LinkedIn (`website`, `github`, `otherLinks`) are omitted from this seed.

---

## 1. Mirror-only storage seed

**Purpose:** autofill + Mixpanel property dual-confirm only.

**Not the production path.** Injecting `chrome.storage.local.personalInfo` from the service worker console skips sign-in → `fetchProfileFromDb` → `writeMirror`. Nothing is written to Supabase.

### Load unpacked

1. `npm run build` (or use an existing `dist/`)
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`

### Seed the mirror (service worker console)

1. On the extension card → **Service worker** → **Inspect**
2. Paste and run. Keys match `PersonalInfo` / `Education` / `Experience` in `src/types/index.ts`. Copy-paste snippet:

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
    resumeFileName: 'ada-lovelace-resume.pdf',
    workAuthorization: 'authorized_no_sponsorship',
    sponsorshipRequired: 'No',
    eeoAnswersEnabled: true,
    gender: 'female',
    raceEthnicity: 'white',
    veteranStatus: 'not_a_veteran',
    disabilityStatus: 'no',
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
      {
        id: 2,
        schoolName: 'University of Texas at Austin',
        degreeType: 'Master of Science',
        major: 'Computer Science',
        startYear: '2020-09',
        graduationYear: '2022-05',
        current: false,
      },
    ],
    experience: [
      {
        id: 1,
        companyName: 'Northwind Labs',
        jobTitle: 'Software Engineer',
        startDate: '2022-06',
        present: true,
        description: 'Shipped internal tools used by the support team.',
        locationCity: 'Austin',
        locationState: 'TX',
      },
      {
        id: 2,
        companyName: 'Contoso',
        jobTitle: 'Support Engineer',
        startDate: '2018-06',
        endDate: '2022-05',
        present: false,
        description: 'Handled product questions and wrote help-center articles.',
        locationCity: 'Austin',
        locationState: 'TX',
      },
    ],
  },
})
```

3. Verify:

```js
const { personalInfo } = await chrome.storage.local.get('personalInfo')
console.log(personalInfo.education, personalInfo.experience)
console.log(
  personalInfo.workAuthorization,
  personalInfo.sponsorshipRequired,
  personalInfo.resumeFileName,
)
console.log(
  personalInfo.eeoAnswersEnabled,
  personalInfo.gender,
  personalInfo.raceEthnicity,
  personalInfo.veteranStatus,
  personalInfo.disabilityStatus,
)
```

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid` (`job-boards.greenhouse.io` or `boards.greenhouse.io`).
2. Trigger autofill.
3. In the **same service worker** DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.
4. On the form, mark each item filled or skipped separately from that event:
   - **Contact (must-have):** name, email, phone, location-style are the proven fill. LinkedIn is not yet proven.
   - **Education (must-have):** `school--0`, `degree--0`, `discipline--0`, `start-month--0`, `start-year--0`, `end-month--0`, `end-year--0` for `education[0]`. `education[1]` has no site-rule ids, so that entry stays skipped.
   - **Experience (must-have, priority gap):** both roles (company, title, dates, description, city/state) if the board shows them. No Greenhouse employment ids, so a skip here is the open site-rules gap. It outranks EEO.
   - **Work authorization and sponsorship (must-have):** `question_*` text for legally authorized and sponsorship.
   - **Resume (must-have):** `resumeFileName` is set. Binary file attach may still be skipped.
   - **EEO (optional, attempted):** gender, race, veteran, and disability when those questions are on the form. Filled when the label matches the handlers. Skipped and non-blocking when the question is missing or unmapped. An EEO skip does not block the experience check above.

Contact name, email, phone, and location-style fields are the proven path. Education, both experience roles, work authorization, sponsorship, LinkedIn, and file attach stay **not yet proven** until this form check passes. EEO stays optional either way.

### Empty-profile reset

```js
await chrome.storage.local.set({ personalInfo: {} })
```

---

## 2. Supabase path dual-confirm

**Purpose:** confirm the production architecture — signed-in profile from Supabase is mirrored locally, then autofilled.

This path is not the mirror-only seed in section 1. A signed-in profile whose remote education, experience, work authorization, or resume filename is empty still cannot prove those Greenhouse must-haves.

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
console.log(
  personalInfo.workAuthorization,
  personalInfo.sponsorshipRequired,
  personalInfo.resumeFileName,
)
console.log(
  personalInfo.eeoAnswersEnabled,
  personalInfo.gender,
  personalInfo.raceEthnicity,
  personalInfo.veteranStatus,
  personalInfo.disabilityStatus,
)
```

If this mirror shows `Alex` / `alex.smoke@example.com`, the popup did not replace the section 1 seed. Section-fill on the form follows whatever rows Supabase returned, which may differ from the fixture above. EEO is attempted only when that remote profile has the values and `eeoAnswersEnabled` is not false. Empty EEO on the remote row is non-blocking.

### Success-path apply

1. Open a Carvana Greenhouse apply URL that includes `gh_jid`.
2. Trigger autofill.
3. In the service worker DevTools → **Network**, confirm Mixpanel receives `autofill_succeeded` with `ats=greenhouse`.

Same split as section 1: that event confirms the contact success path. Education ids (`school--0`, `degree--0`, `discipline--0`, `start-month--0`, `start-year--0`, `end-month--0`, `end-year--0`), both experience roles, work authorization, sponsorship, and resume file attach stay unproven until the form shows them. `resumeFileName` on the remote profile is still a filename; Greenhouse site rules do not upload the file. EEO is optional and attempted when the vault has values; a missing or unmapped EEO question is skipped and does not block the experience gap.
