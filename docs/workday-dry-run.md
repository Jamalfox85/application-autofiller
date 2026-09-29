# Workday manual dry-run

Engineering checklist for the three live-tenant prove-outs. This is not a success-rate report. A pass is what a person sees on the form before Submit.

Postings below were open on **2026-09-29** (`canApply: true` on Workday's public CXS job endpoint). Re-open each URL before the run. If the posting is closed, or the only path is SSO with no "Sign in with email" / "Create Account", stop and pick another external posting. Do not use a password-manager or company SSO.

Host families `*.myworkday.com` and `*.myworkdaysite.com` are covered by unit tests. The public apply flows found for this pass are on `*.myworkdayjobs.com`.

## Tenants

1. **NVIDIA** — NVIDIA 2027 Internships: Software Engineering (`JR2023495`)
   - https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/NVIDIA-2027-Internships--Software-Engineering_JR2023495/apply
2. **Adobe** — 2027 University Graduate - Software Engineer (`R172083`, San Jose, posting end 2026-12-31)
   - https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/XMLNAME-2027-University-Graduate---Software-Engineer_R172083/apply
3. **Vanguard** — Entry Level Application Engineer - 2027 Start Date (`180412`, Charlotte, NC, posting end 2026-12-31)
   - https://vanguard.wd5.myworkdayjobs.com/en-US/vanguard_external/job/Charlotte-NC/Entry-Level-Application-Engineer----2027-Start-Date_180412/apply

## Do not

- Do not click **Submit**, **Submit Application**, or **Send**.
- You may click **Apply**, **Apply Manually**, **Next**, or **Save and Continue** to reach later steps. Stop on the review step.
- Create Account is not application submit. To prove the missing-login path, leave Application Accounts empty and confirm the notice instead of creating a candidate account.

## Profile to load

- Contact: first name, last name, email, phone, address, city, state (abbreviation is fine), postal code, country.
- One current experience (`present`, no end date) and one past experience (end date `YYYY-MM`).
- One education row: school, degree, field of study, start year, graduation year.
- Optional: EEO on, with disability status `yes` / `no` / `decline`.
- Resume: the vault stores a filename only. Attach the file yourself if you want it on the form. GoFillr will not upload it.
- Work authorization and "how did you hear about us" should stay empty. Those questions are out of v1.

## Steps

1. Open the apply URL. If the extension is set to auto-detect, let it run. Otherwise trigger fill once.
2. **Account.** With no Workday login saved: the Application Accounts notice appears, email/password stay empty, and Create Account is not clicked. With a login saved: email, password, and verify password fill, and only the Create Account control is clicked — not a Next button that happens to use the same click target.
3. **My Information.** First and last name, address line 1, city, postal code, phone, and email match the profile. Address line 2 fills only when the profile has one. Middle name stays blank. Country and state show a **selected** option (a full state name when the profile has an abbreviation), not text typed into the closed button. Phone device type is Mobile or Cell, selected from the list.
4. **Source / how did you hear.** Left blank. No "Indeed" or other option is chosen.
5. **Resume.** The file input is still empty until you attach a file.
6. **My Experience.** A work-experience row is added for each profile role: job title, company, location only when city or state exists, start month and year in the date parts. Current role checks "I currently work here" and does not invent an end date. Past role fills the end date. Education adds a row: school and field of study are chosen from the suggestion list when one matches; degree is a selected list option, not only typed text; GPA and years fill when present. A tenant that shows only one of the two sections still fills that section.
7. **Work authorization and other custom questions.** Untouched.
8. **EEO.** With EEO answers off, disability, signature name, and signature date stay empty. With EEO on, the disability choice matches the label (not a checkbox picked only by position), and the self-id name and today's date fill.
9. Stop before Submit. The page should not keep opening and closing the same dropdown.

## Pass

- Supported fields above are filled correctly.
- Dropdowns show a selected option.
- Nothing landed in the wrong field.
- The page did not hang.
- Submit was not clicked.
