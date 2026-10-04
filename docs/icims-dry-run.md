# iCIMS manual dry-run

Unpacked-extension checklist for the email-first apply gate and the application behind it. This is not a success-rate report. A pass is what a person sees on the form before anyone clicks Next, Log In, or Submit.

Do not submit an application. Do not solve or click hCaptcha. If a posting is closed, stop and pick another external iCIMS job. The extension does not click Next, Log In, Create Account, or Submit.

## Tenants

Checked as open apply targets on 2026-09-29. Re-open each URL before the run.

1. **IC-1** — https://us-erac.icims.com/jobs/555885
2. **IC-2** — https://careersintl-hireright1.icims.com/jobs/6855 (EU/UK resident checkbox on the gate)
3. **IC-3** — https://careers-jobyaviation.icims.com/jobs/5424 (5347 is closed)

After Apply, the career host navigates to `…/jobs/{id}/…/login`, often inside an iframe (`?in_iframe=1`). The first screen is “Enter Your Information” with Email and Next. IC-2 and IC-3 also show an EU/UK resident checkbox. hCaptcha attribution is common. Application fields are not on this screen.

## Profile to load

- Application Accounts: one row, portal **iCIMS**, with the email and password for that career site.
- “Require confirmation before filling” may stay on. GoFillr still types the password, matching Workday account creation, which does not read that flag.
- Contact: first name, last name, a profile email (it can differ from the iCIMS login), phone, street, city, state, postal code, country, LinkedIn.
- One current experience (no end date) and one past experience.
- One education row: school, degree, field of study, start year, graduation year.
- Work authorization and, if you want EEO checked, EEO answers on.
- Resume: upload it in GoFillr first (Links & files shows the filename). The profile mirror stores that name; the file bytes are in the private `resumes` bucket at `profiles.resume_file_path`. Autofill downloads that object and selects it on a plain Resume / upload / choose-file input. It does not drive an “Autofill with resume” control.

## Steps

1. Load the unpacked extension. Open the job URL and click **Apply** yourself. Stop on the login document (`/login`, including the iframe).
2. **Saved iCIMS account, email step.** “Enter Your Information” (email field, no password yet) does not show a popup telling you to create an iCIMS account. Email on that step becomes the Application Accounts email, not the profile email when those differ. Do not click **Next**. If hCaptcha is visible, it stays unsolved and unclicked. The EU/UK resident checkbox stays as the page rendered it (GoFillr has no EU/UK resident answer).
3. Complete hCaptcha yourself and click **Next** only if you want to continue the dry-run. On the password step, the password (and confirm password, when that field exists) fills from the same iCIMS row. Log In / Create Account is not clicked.
4. **No iCIMS account.** Remove or blank the iCIMS Application Accounts row, reload the login gate, and confirm the missing-login notice still appears (page toast, toolbar badge, and the Application Accounts sheet). No popup tells you to create an account on this site. The password stays empty (the legacy Workday account password is not used). Do not click **Next**.
5. **Application, after you pass the gate yourself.** Contact fields fill when the control id or label is a standard iCIMS field: first and last name, profile email, phone, street, city, state, postal code, country, LinkedIn. Address line 2 stays empty. Phone type stays empty. Country is selected before State/Province. A profile country of United States selects United States on the country menu (including the searchable menu that starts on “— Make a Selection —”). The state menu then shows the full state name (New Jersey when the profile says NJ), not “Please select a country”.
6. **Later sections, only where the field id is clearly that section.** Experience row 0 gets the current role and does not gain an end date. Row 1 gets the past role. Education gets school, degree, major, and years. Work authorization and sponsorship follow the profile when those menus are standard selects. EEO fills only when EEO answers are on. `rcf` custom questions and “how did you hear” stay blank.
7. Stop before Submit. On a plain resume choose-file input (a real `input[type=file]` labeled Resume, upload, or choose file), the selected file is the resume already uploaded in GoFillr — same filename and bytes. An “Autofill with resume” control stays untouched. The extension does not click that control, Next, or Submit. If the saved resume cannot be downloaded, the file input stays empty.

## Pass

- No popup asks you to create an iCIMS account on this site.
- The login gate shows the saved iCIMS email, and the password step shows the saved password.
- hCaptcha was not clicked or solved. Next, Log In, Create Account, and Submit were not clicked by the extension.
- The EU/UK checkbox was not changed.
- Supported application fields behind the gate match the profile. Country shows United States and State/Province shows New Jersey when the profile country is United States and the state is NJ. Custom questions are blank.
- The plain resume file input shows the saved resume as its selected file. Submit was not clicked. “Autofill with resume” was not clicked.
- The missing-account notice still appears when the iCIMS row is absent.
