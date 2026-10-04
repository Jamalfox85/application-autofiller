# Jobvite manual dry-run

Unpacked-extension checklist for a hosted Jobvite application. This is not a success-rate report. A pass is what a person sees on the form before anyone clicks Next or Send Application.

Do not submit an application. Do not solve or click reCAPTCHA. If a posting is closed, stop and pick another open Jobvite job. The extension does not click Next, Send Application, or Submit, and it does not create an account.

## Tenants

Checked as open apply targets on 2026-10-04. Re-open each URL before the run. The current hosted shape is `https://jobs.jobvite.com/{company}/job/{id}` and `…/apply`. Older boards still use `/careers/{company}/job/{id}/apply`; both hosts are `*.jobvite.com`.

1. **JV-1** — https://jobs.jobvite.com/uplight/job/oPTRAfwT/apply (step 1 contact + work authorization, step 2 EEO). No work-history or education fields on the form.
2. **JV-2** — https://jobs.jobvite.com/sikichcareers/job/o4bKAfwj/apply (contact including preferred first name and address, step 2 OFCCP, step 3 prescreen).
3. **JV-3** — https://jobs.jobvite.com/internetbrands/job/oH9MAfwW/apply (Work Status dropdown, then OFCCP).

`app.jobvite.com` is the candidate tracker, not an apply form. A careers site on a company domain that embeds Jobvite in a frame is filled only when that frame’s host is `jobvite.com`.

## Profile to load

- Contact: first name, last name, email, phone with country code, street, city, state (abbreviation is fine), postal code, country, LinkedIn.
- One current experience (no end date) and one past experience, with descriptions.
- One education row: school, degree, field of study, start year, graduation year.
- Work authorization (citizen, permanent resident, or another saved status) and sponsorship required.
- EEO answers on, if you want gender, race, veteran, disability, age-18, and the OFCCP name/date filled. Prefer not to say is stored as empty and must stay blank.
- Resume: the vault stores a filename only. GoFillr will not upload the file.

## Steps

1. Load the unpacked extension. Open the apply URL yourself. Stop on the Jobvite apply form (`.jv-apply-form`).
2. **Step 1.** First name, last name, email, phone, LinkedIn, address, city, state, postal code, and country fill from the profile. A state menu shows the matching option (California when the profile says CA). Country “United States” is the United States option, not United States Minor Outlying Islands. Preferred first name, when that field exists, uses the first name.
3. **Work authorization on this step.** “Authorized to work” follows the profile (Yes for citizen, permanent resident, work visa, or authorized without sponsorship; No for needs sponsorship). A Work Status menu maps US Citizen and Permanent Resident only. It does not pick H1, TN, or F1. Sponsorship Yes/No follows “sponsorship required” when that is set.
4. **Left blank on purpose.** Resume / Add resume, cover letter, how did you hear, referral name, salary, SMS consent, county, non-compete, “previously worked here”, notice period, and every other free-text screening question stay empty. reCAPTCHA stays unsolved. Next and Send Application are not clicked.
5. **Later steps, only after you click Next yourself.** EEO and OFCCP (gender, Hispanic Yes/No, race, veteran, disability, Your Name, Today’s Date) fill when EEO answers are on. “If no, what race” stays blank when the profile is Hispanic or Latino. Prescreen age-18 and the authorization questions fill from the profile. With EEO answers off, those voluntary fields stay blank.
6. **Experience and education.** Fill only when the form actually renders those labels (company, title, school, degree, dates). Many hosted Jobvite forms collect history from the resume upload instead, so those rows will not appear. A current role does not gain an end date. A third row stays empty.
7. Stop before Send Application. The toast count is fields that were written, not fields that were recognized and left blank.

## Pass

- Contact on step 1 matches the profile. The resume control is still empty.
- Work authorization and, on JV-3, Work Status match the profile without choosing a specific visa type.
- How did you hear, salary, SMS consent, and other custom questions are blank.
- After you open step 2 yourself, EEO / OFCCP matches the profile when EEO answers are on, and stays blank when they are off.
- Next, Send Application, and reCAPTCHA were not used by the extension.

## Known gaps

- No account is created and no password is typed. Jobvite’s hosted apply flow does not require an account; `app.jobvite.com` is ignored except that the host still counts as Jobvite.
- Multi-step wizards keep later steps out of the page until Next. The extension will not click Next. After you do, a refill runs because the apply form gained fields.
- The resume file is never attached. Work history and education are often absent until Jobvite parses an uploaded resume, so those sections stay empty on many postings.
- Custom-domain embeds fill only when the apply document itself is on `jobvite.com` (the content script runs in that frame). A form that is not a Jobvite document is out of scope.
- Custom and free-text screening questions are out of v1. They are left blank rather than answered from a guess.
