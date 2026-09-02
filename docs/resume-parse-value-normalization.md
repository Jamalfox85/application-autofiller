# Prompt: normalize parsed résumé values to the extension's canonical enums

## Task

When the résumé-upload endpoint parses a résumé and writes to the database (and returns the
`parsed` object in the response), a few fields must be **normalized to the exact string values
the GoFillr extension's popup `<select>` elements use**. The extension prefills its form from
this data and later re-reads it from the DB; if a value isn't an exact match for a `<option>`,
the field renders blank and the user has to re-enter it.

Résumés realistically only give us three of these: **state**, **country**, and **degree type**.
Do those well. The rest (demographics, work authorization, etc.) aren't in résumés — see the
appendix only if that ever changes.

## Where to apply it

1. **Required — DB columns.** Write the canonical value (or `NULL` if you can't confidently
   map it) to:
   - `profiles.state`, `profiles.country`
   - `work_experience.location_state`
   - `education.location_state`, `education.degree_type`
2. **Strongly preferred — the API response.** Return the same canonical values in
   `data.parsed` so the first-upload review screen matches without the client re-deriving.
   Keep the raw string alongside for debugging:
   - `parsed.contact` → add `city`, `state`, `country` (canonical); keep `location` (raw).
   - `parsed.work_history[]` → add `location_city`, `location_state` (canonical); keep
     `location` (raw).
   - `parsed.education[]` → `degree` becomes the canonical enum; add `degree_raw` with the
     original text.

If you can only do #1, tell us — the extension will normalize the response client-side from
the same table below, but the DB must be canonical.

## Rules

- **Never guess.** If the parsed text doesn't clearly map to one of the allowed values, write
  `NULL` / omit it. The extension shows "Add manually" for empty fields — that's the correct
  fallback, not a wrong value.
- When you write `NULL` for a field you *did* find text for but couldn't map, add a
  `field_notes` entry (the existing low-confidence mechanism), e.g.
  `field_notes.state = "Couldn't match 'Greater Boston Area' to a state"`.
- `state` cannot be set unless `country` is one of the three supported values. If the résumé
  location is e.g. "Berlin, Germany", set neither.
- Case-sensitive, exact match. `bachelors` not `Bachelors`. `New_York` not `New York` or `NY`.

---

## 1. `country` — allowed values

| value | matches (case-insensitive) |
|---|---|
| `united_states` | us, usa, u.s., u.s.a., united states, united states of america, america |
| `canada` | ca, can, canada |
| `united_kingdom` | uk, u.k., gb, gbr, united kingdom, great britain, britain, england*, scotland*, wales* |

\* England/Scotland/Wales imply `united_kingdom` for the country field **and** map to the
region for the state field.

Anything else → leave `country` and `state` empty.

## 2. `state` / `location_state` — allowed values

The stored value is the **full region name with spaces replaced by underscores**. Not the
postal abbreviation.

**United States** (when `country = united_states`):

```
Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia
Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts
Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada New_Hampshire New_Jersey
New_Mexico New_York North_Carolina North_Dakota Ohio Oklahoma Oregon Pennsylvania
Rhode_Island South_Carolina South_Dakota Tennessee Texas Utah Vermont Virginia Washington
West_Virginia Wisconsin Wyoming
American_Samoa Guam Northern_Mariana_Islands Puerto_Rico US_Virgin_Islands Washington_DC
```

Accept as input: the full name (any case), the 2-letter postal code (`GA`, `NY`, `DC`), and
common abbreviations (`Calif.`, `Mass.`, `Penn.`, `Wash.`). `D.C.` / `Washington DC` /
`District of Columbia` → `Washington_DC`.

**Canada** (`country = canada`): `Alberta British_Columbia Manitoba New_Brunswick
Newfoundland_and_Labrador Northwest_Territories Nova_Scotia Nunavut Ontario
Prince_Edward_Island Quebec Saskatchewan Yukon`. Accept 2-letter codes (`ON`, `BC`, `QC`).

**United Kingdom** (`country = united_kingdom`): `England Scotland Wales Northern_Ireland`.

**Parsing the location string:** résumé locations look like `"Austin, TX"`, `"Atlanta, Georgia"`,
`"New York, NY, USA"`, `"London, United Kingdom"`, `"Remote"`, `"Greater Seattle Area"`. Take
the last comma-separated segment that looks like a country → `country`; the segment before it
that looks like a state/region → `state`; the first segment → `city` (free text, no
normalization). `"Remote"`, metro-area phrases, and anything you can't confidently split →
`city` empty or raw, `state`/`country` `NULL`.

## 3. `degree_type` — allowed values

| value | matches |
|---|---|
| `high_school_diploma` | high school, hs diploma, ged, secondary school |
| `associates` | associate, associate's, associates, a.a., a.s., aa, as, a.a.s. |
| `bachelors` | bachelor, bachelor's, bachelors, b.a., b.s., ba, bs, bsc, b.eng, ab, undergraduate degree |
| `masters` | master, master's, masters, m.a., m.s., ma, ms, msc, m.eng, mba, m.b.a. |
| `phd` | phd, ph.d., doctorate, doctoral, d.phil, sc.d., ed.d. |
| `certificate` | certificate, certification, cert, professional certificate, nanodegree |
| `bootcamp` | bootcamp, boot camp, immersive, coding bootcamp |

The résumé's `field` / major (e.g. "Computer Science") stays free text in `education.major` —
don't touch it.

## Test cases

| résumé says | `country` | `state` | `degree_type` |
|---|---|---|---|
| "Atlanta, GA" | `united_states` | `Georgia` | — |
| "Atlanta, Georgia" | `united_states` | `Georgia` | — |
| "New York, NY, United States" | `united_states` | `New_York` | — |
| "Washington, D.C." | `united_states` | `Washington_DC` | — |
| "Toronto, ON" | `canada` | `Ontario` | — |
| "London, UK" | `united_kingdom` | `England`? (only if stated) | — |
| "Remote" | `NULL` | `NULL` | — |
| "Greater Boston Area" | `NULL` | `NULL` (+ field_note) | — |
| "B.S. in Computer Science" | — | — | `bachelors` |
| "Master of Business Administration" | — | — | `masters` |
| "Full-Stack Web Development Certificate" | — | — | `certificate` |
| "Ph.D., Physics" | — | — | `phd` |

---

## Appendix — fields NOT in résumés (only if you ever parse them)

`profiles.phone_country_code`: `+1` (US/Canada) or `+44` (UK). Default `+1`.

`profiles.gender`: `` (empty = prefer not to say) · `male` · `female` · `non_binary` · `self_describe`

`profiles.race_ethnicity`: `` · `american_indian_or_alaska_native` · `asian` ·
`black_or_african_american` · `hispanic_or_latino` ·
`native_hawaiian_or_other_pacific_islander` · `white` · `two_or_more_races`

`profiles.disability_status`: `` · `yes` · `no` · `previously`

`profiles.veteran_status`: `` · `not_a_veteran` · `veteran`

`profiles.age_18_or_older`: `yes` · `no` · ``

`profiles.work_authorization`: `us_citizen` · `green_card` · `authorized_no_sponsorship` ·
`work_visa` · `need_sponsorship`

`profiles.sponsorship_required`: `Yes` · `No` (capitalized)

`profiles.notice_period`: `Immediately` · `2 weeks` · `1 month` · `2 months`
