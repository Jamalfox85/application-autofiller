# Resume API → profile write contract

**Decision (2026-08-28):** the extension and the Go resume API converge on the extension's
schema — normalized child tables + flat `profiles` columns. The API should **stop writing** the
`profiles` jsonb columns (`contact`, `work_history`, `education`, `skills`) as the profile of
record and instead write the tables/columns below. (The jsonb columns can stay for the
resume-generation pipeline if it still needs them, but they are no longer the source of truth
for the user's profile.)

The extension autofills job forms directly from these tables, so shape fidelity matters.

## First upload (`first_upload: true`) — full profile upsert

### `profiles` row (`id = auth user id`)

| Column | Source | Notes |
|---|---|---|
| `first_name`, `middle_name`, `last_name` | split `parsed.name` on whitespace | first / middle(s) / last; single token → first only |
| `full_name` | `parsed.name` | keep writing it too if useful; the extension ignores it |
| `email` | `parsed.contact.email` | |
| `phone` | `parsed.contact.phone` | |
| `city`, `state` | split `parsed.contact.location` on the last comma | `"Austin, TX"` → city `Austin`, state `TX`; no comma → city only |
| `linkedin` | `parsed.contact.linkedin` | normalize to a full URL: bare handle `in/x` → `https://linkedin.com/in/x`; `linkedin.com/...` → prefix `https://` |
| `website` | `parsed.contact.website` | normalize: `janedoe.dev` → `https://janedoe.dev` |
| `summary` | `parsed.summary` | text column already exists; extension doesn't use it |
| `resume_file_name` | uploaded file's original name | optional but nice — otherwise the extension's file card is blank until the user saves |
| `resume_file_path`, `resume_parsed_at` | as today | extension never touches these |

Do **not** write `first_name`/etc. as empty strings — use `NULL` when a value is absent.

### `work_experience` table — one row per `parsed.work_history[]`, in array order

| Column | Source | Notes |
|---|---|---|
| `user_id` | auth user id | |
| `company_name` | `company` | **NOT NULL** — use `''` if truly missing |
| `job_title` | `title` | **NOT NULL** |
| `start_date` | `start_date` → real `date` | `"2021"` → `2021-01-01`; `"2021-06"` → `2021-06-01`; unparseable → `NULL` |
| `end_date` | `end_date` → real `date` | `NULL` when `current` is true |
| `present` | `current` | |
| `description` | `description`, else `bullets` joined with `\n` | |
| `location_city`, `location_state` | split `location` (last comma) | |
| `display_order` | array index | |

The extension reads `start_date`/`end_date` back as `"YYYY-MM"` for a month picker, so any
real date works.

### `education` table — one row per `parsed.education[]`, in array order

| Column | Source | Notes |
|---|---|---|
| `user_id` | auth user id | |
| `school_name` | `institution` | **NOT NULL** |
| `degree_type` | `degree` | free text is fine (`"BS"`, `"Bachelor's"`, …) |
| `major` | `field` | |
| `gpa` | `gpa` → `numeric` | parse; `NULL` if not a number |
| `start_year` | year of `start_date` | **text** column — store just the year (`"2014"`) |
| `graduation_year` | year of `end_date` | **text** |
| `current` | `false` | the parsed shape has no education "current" flag |
| `display_order` | array index | |

### `skills` table — one row per `parsed.skills[]` string, in array order

| Column | Source | Notes |
|---|---|---|
| `user_id` | auth user id | |
| `name` | the string | **NOT NULL**; skip empty strings |
| `display_order` | array index | |
| `category`, `proficiency` | `NULL` | |

### Not represented in the extension schema

`parsed.certifications` — the extension has no field for these. Keep them in
`profiles.certifications` jsonb if the pipeline wants them; the extension ignores it.

## Subsequent upload (`first_upload: false`)

Unchanged from current behavior: touch **only** `resume_file_path` (+ `resume_parsed_at`),
and only if the file extension changed. Do not re-upsert the profile or the child tables —
the user may have edited them by hand in the extension.

## Write-race note

On a first upload the API and the extension both write these tables (the extension when the
user reviews the prefilled form and hits Save, a few seconds later). The extension's
`saveProfileToDb` does `upsert` on `profiles` for the columns it maps and full delete+insert
on each child table, so the user's reviewed version wins — which is intended. API-only columns
(`summary`, `certifications`, `resume_file_path`, `resume_parsed_at`, `full_name`) are not in
the extension's write set and survive.

## Auth / RLS

The API uses the service-role key, so it bypasses RLS — it just needs `user_id` correct on
every child row. The extension uses the user's JWT; child-table RLS is `auth.uid() = user_id`,
profile RLS is `auth.uid() = id`.
