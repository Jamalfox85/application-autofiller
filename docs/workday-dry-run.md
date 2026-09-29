# Workday manual dry-run

Engineering checklist for the three live-tenant prove-outs. This is not a success-rate report. A pass is what a person sees on the form before Submit.

Postings below were checked **2026-09-29 ET** (`isExternal` / `postingAvailable` true). Re-open each URL before the run. If the posting is closed, or the only path is SSO with no "Sign in with email" / "Create Account", stop and pick another external posting. Do not use a password-manager or company SSO.

These are external job URLs on `*.myworkdayjobs.com` (Cisco and Zillow on `wd5`, Salesforce on `wd12`). The apply chooser opens from **Apply** on that page, then **Apply Manually**. Host families `*.myworkday.com` and `*.myworkdaysite.com` are covered by unit tests.

## Tenants

1. **Cisco** — Software Engineering Technical Leader - Cisco IQ (`2019787`)
   - https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Software-Engineering-Technical-Leader---Cisco-IQ_2019787
2. **Salesforce** — Lead Software Engineer - Enterprise Agents (`JR355645`, California - San Francisco)
   - https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/California---San-Francisco/Lead-Software-Engineer---Enterprise-Agents_JR355645
3. **Zillow** — Senior Software Engineer (`P751275-1`)
   - https://zillow.wd5.myworkdayjobs.com/en-US/Zillow_Group_External/job/Senior-Software-Engineer_P751275-1

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

1. Open the job URL. The extension clicks the **Apply** button whose label is Apply, then **Apply Manually**. If those controls are not clicked, click them yourself. Do not click **Autofill with Resume**, **Use My Last Application**, or **Submit**. If auto-detect is on, let fill run; otherwise trigger fill once.
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
