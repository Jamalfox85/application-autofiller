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
| Experience: 2 roles | `experience[0]`, `experience[1]` | **Not yet proven on a live form.** Site rules fill `company-name-N`, `title-N`, `start-date-month-N`, `start-date-year-N`, `end-date-month-N`, `end-date-year-N`, and `current-role-N_1` from `experience[N]`. The board renders row 0 until "Add another" adds row 1. Description and city/state are not inputs on this employment block. |
| Education: 2 entries | `education[0]`, `education[1]` | **Not yet proven on a live form.** Handlers read `education[N]` for `school--N` and the other `--N` ids. The board shows row 0 until the education **Add another** button reveals row 1. Re-smoke this seed before marking it proven. |
| Work authorization and sponsorship | `workAuthorization`, `sponsorshipRequired` | **Not yet proven.** Handlers exist; the prior seed omitted both keys. |
| Resume filename | `resumeFileName` | **Filename is set. Binary attach may still be skipped.** `greenhouse.ts` does not upload a file. |
| EEO (optional) | `eeoAnswersEnabled`, `gender`, `raceEthnicity`, `veteranStatus`, `disabilityStatus` | **Attempted, not a must-have.** Fill when the vault has values and the question text matches. Missing or unmapped questions are skipped and non-blocking. This does not gate the experience gap. |

### Contact — proven (except LinkedIn)

- `firstName`, `lastName`, `email`, `phone`, `phoneCountryCode` (Greenhouse phone dialing-code combobox, id `country`)
- Location-style: `address`, `city`, `state`, `zip`, `country`, and the Greenhouse city typeahead `candidate-location`
- `linkedin` is in this seed. Record it proven only after a run shows the field filled.

### Experience — 2 roles, handlers wired, not yet proven on a live form

Both rows use `Experience` keys from `src/types/index.ts`: `companyName`, `jobTitle`, `startDate`, `endDate` or `present`, `description`, `locationCity`, `locationState`.

- `experience[0]` is the current role (`present: true`, no `endDate`).
- `experience[1]` is a past role (`present: false`, `endDate` set).

Job-boards employment ids (the same form on `boards.greenhouse.io` and `job-boards.greenhouse.io`) use a single dash and a zero-based key. That is not the education `--0` pattern. `src/utils/siteRules/greenhouse.ts` reads `experience[N]` for these ids:

| `PersonalInfo` field | Greenhouse id | How the handler reads it |
| --- | --- | --- |
| `companyName` | `company-name-0`, `company-name-1` | Text input. |
| `jobTitle` | `title-0`, `title-1` | Text. |
| `startDate` | `start-date-month-N`, `start-date-year-N` | `2022-06` → June and `2022`. A bare year fills the year and skips the month. |
| `endDate` | `end-date-month-N`, `end-date-year-N` | Filled when `present` is not true. `2022-05` → May and `2022`. |
| `present` | `current-role-N_1` | Checkbox. `present: true` checks it and leaves the end-date inputs empty. |

The form renders one employment row (key 0) until **Add another**. Key 1 is `experience[1]`. `formChanged` refills when that row's inputs appear.

`description`, `locationCity`, and `locationState` are on the seed. The current employment block does not render inputs for them, so those values stay unfilled.

Still not proven until a live form shows the values. EEO is an optional attempt on the same run. A skipped gender, race, veteran, or disability control does not block these two roles.

### Education — 2 entries, handlers wired, not yet proven on a live form

`src/utils/siteRules/greenhouse.ts` reads `education[N]` for the `--N` ids. Row 0 is on the form. Row 1 appears after the handler clicks **Add another** inside `.education--container` (the employment section has a separate button and is not clicked here). `formChanged` refills when the new inputs appear.

| `PersonalInfo` field | Greenhouse id | How the handler reads it |
| --- | --- | --- |
| `schoolName` | `school--0`, `school--1` | Catalog query, then a whole-token pick. `University of Texas at Austin` searches `University of Texas - Austin`. An A-page hit such as Alverno College is not selected. |
| `degreeType` | `degree--0`, `degree--1` | `degreeSearchValues` (`Bachelor of Science` → `Bachelor's Degree`, `Master of Science` → `Master's Degree`) |
| `major` | `discipline--0`, `discipline--1` | `disciplineSearchValues` (`Computer Science`). The pick is the catalog label, not a substring. |
| `startYear` | `start-month--N`, `start-year--N` | `2016-09` → September and `2016`. `2020-09` → September and `2020`. A bare year fills the year and skips the month. |
| `graduationYear` | `end-month--N`, `end-year--N` | `2020-05` → May / 2020. `2022-05` → May / 2022. |

`current` is on `Education`. These handlers do not read it.

Re-smoke with the full-profile seed in this doc (`SMOKE_DUAL_CONFIRM`) before calling education proven. Expect both rows: UT Austin, Computer Science, bachelor dates September 2016–May 2020, then the master's row September 2020–May 2022.

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
   - **Education (must-have):** `school--0`, `degree--0`, `discipline--0`, `start-month--0`, `start-year--0`, `end-month--0`, `end-year--0` for `education[0]` (University of Texas - Austin, Bachelor's Degree, Computer Science, September 2016–May 2020). The education **Add another** control reveals `school--1` and the other `--1` ids for `education[1]` (same school, Master's Degree, September 2020–May 2022). A wrong alphabetical school (Alverno or Austin College) is a fail.
   - **Experience (must-have):** `company-name-0`, `title-0`, `start-date-month-0`, `start-date-year-0`, and `current-role-0_1` for `experience[0]` (current role: June 2022, end dates left empty). After **Add another**, the `-1` ids for `experience[1]` (Contoso, June 2018–May 2022, current role unchecked). Description and city/state are not on this block. A board with `employment: hidden` has nothing to fill. It outranks EEO.
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

Same split as section 1: that event confirms the contact success path. Education ids for both rows (`school--N`, `degree--N`, `discipline--N`, `start-month--N`, `start-year--N`, `end-month--N`, `end-year--N`, including `--1` after the education Add another click), both experience roles (`company-name-N`, `title-N`, `start-date-month-N`, `start-date-year-N`, `end-date-month-N`, `end-date-year-N`, `current-role-N_1`), work authorization, sponsorship, and resume file attach stay unproven until the form shows them. `resumeFileName` on the remote profile is still a filename; Greenhouse site rules do not upload the file. EEO is optional and attempted when the vault has values; a missing or unmapped EEO question is skipped and does not block the experience gap.
