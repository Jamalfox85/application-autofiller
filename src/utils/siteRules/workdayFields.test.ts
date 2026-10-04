import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import {
  WORKDAY_CREATE_ACCOUNT_SELECTOR,
  WORKDAY_SIGN_IN_LINK_SELECTOR,
  WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR,
  findWorkdaySectionAddButton,
  isWorkdayAccountCreationForm,
  isWorkdaySignInForm,
  workdayAccountAgreementCheckbox,
  workdayAccountCredentialKind,
  workdayAccountInputs,
  workdayCreateAccountLink,
  workdayFieldControl,
  workdayJobApplyButton,
  workdaySignInInputs,
  workdaySignInWithEmailButton,
  listWorkdayPanels,
  matchingOptionText,
  nextWorkdayFormSignature,
  workdayAccountSubmitControl,
  workdayActivePrompt,
  workdayApplicationQuestionKind,
  workdayContactKey,
  workdayDatePartInput,
  workdayDegreeOption,
  workdayDisabilityOptionIndex,
  workdayElementIsFormerEmployee,
  workdayElementIsPhoneDeviceType,
  workdayElementIsSource,
  workdayExperienceLocation,
  workdayFormerEmployeeListboxButton,
  workdayIsCustomSourceField,
  workdayIsFormerEmployeeQuestion,
  workdayListboxButton,
  workdayListboxIsEmpty,
  workdayListboxValue,
  workdayListedProfileOption,
  workdayListedSearchText,
  workdayListedValueMatches,
  workdayOptionElement,
  workdayOptionLabels,
  workdayPhoneDeviceTypeButton,
  workdayCompanyOwnedSourceOption,
  workdayCompanyToken,
  workdayPhoneTypeOption,
  workdayPreferredSourceOption,
  workdayProfileChoice,
  workdayPromptFaceIsEmpty,
  workdaySafeNoOption,
  workdaySectionKindFromLabel,
  workdaySourceListboxButton,
  workdaySourceOption,
  workdaySuggestionOption,
  workdaySelectKind,
  workdaySelectValue,
} from './workdayFields.ts'

const probe = (attrs: Record<string, string>) => ({
  id: attrs.id || '',
  name: attrs.name || '',
  getAttribute: (name: string) => attrs[name] ?? null,
})

test('contact keys follow Workday form-kit paths and ignore the account email control', () => {
  assert.equal(
    workdayContactKey(probe({ id: 'name--legalName--firstName' })),
    'firstName',
  )
  assert.equal(
    workdayContactKey(probe({ 'data-fkit-id': 'name--legalName--lastName' })),
    'lastName',
  )
  assert.equal(
    workdayContactKey(probe({ 'data-automation-id': 'legalNameSection_firstName' })),
    'firstName',
  )
  assert.equal(
    workdayContactKey(probe({ 'data-automation-id': 'formField-emailAddress' })),
    'email',
  )
  assert.equal(workdayContactKey(probe({ id: 'emailAddress' })), 'email')
  assert.equal(workdayContactKey(probe({ id: 'phoneNumber--phoneNumber' })), 'phone')
  assert.equal(workdayContactKey(probe({ id: 'address--postalCode' })), 'postal')
  // Preferred name and the account-creation email are different controls.
  assert.equal(workdayContactKey(probe({ id: 'name--preferredName--firstName' })), null)
  assert.equal(workdayContactKey(probe({ 'data-automation-id': 'email' })), null)
  assert.equal(workdayContactKey(probe({ 'data-automation-id': 'firstName' })), null)
})

test('custom source fields are recognized from the control id', () => {
  assert.equal(workdayIsCustomSourceField(probe({ id: 'source' })), true)
  assert.equal(workdayIsCustomSourceField(probe({ 'data-automation-id': 'formField-source' })), true)
  assert.equal(
    workdayIsCustomSourceField(probe({ 'data-fkit-id': 'source--howDidYouHearAboutUs' })),
    true,
  )
  assert.equal(workdayIsCustomSourceField(probe({ id: 'name--legalName--firstName' })), false)
})

test('job-page Apply is the adventure button labeled Apply, not search or Apply Manually', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="adventureButton" id="search">Search</button>
    <a data-automation-id="adventureButton" id="apply">Apply</a>
    <button data-automation-id="adventureButton" id="submit">Submit</button>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdayJobApplyButton(doc)?.id, 'apply')
  doc.body.insertAdjacentHTML(
    'beforeend',
    '<a data-automation-id="applyManually" id="manual">Apply Manually</a>',
  )
  assert.equal(workdayJobApplyButton(doc), null)
})

test('account creation requires verify password and ignores a stray click filter', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="click_filter" id="next">Next</button>
    <input data-automation-id="emailAddress" id="emailAddress" />
  </body>`)
  const doc = dom.window.document
  assert.equal(isWorkdayAccountCreationForm(doc), false)
  assert.equal(workdayAccountSubmitControl(doc), null)

  doc.body.innerHTML = `
    <button data-automation-id="click_filter" id="next">Next</button>
    <input data-automation-id="email" />
    <input data-automation-id="password" />
    <input data-automation-id="verifyPassword" />
    <div data-automation-id="click_filter" id="account-filter">
      <button data-automation-id="createAccountSubmitButton" id="create-submit" aria-hidden="true">Create Account</button>
    </div>
  `
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'create-submit')
})

test('Cisco create-account skips sign-in and the agreement checkbox and clicks the submit button', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="click_filter" id="next">Next</button>
    <input data-automation-id="email" />
    <input data-automation-id="password" />
    <input data-automation-id="verifyPassword" />
    <button data-automation-id="createAccountSubmitButton" id="create-submit">Create Account</button>
  </body>`)
  const doc = dom.window.document
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayCreateAccountLink(doc), null)
  assert.equal(workdayAccountAgreementCheckbox(doc), null)
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'create-submit')
})

test('click_filter is the account submit fallback only inside the account card', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="click_filter" id="next">Next</button>
    <form id="account">
      <input data-automation-id="email" />
      <input data-automation-id="password" />
      <input data-automation-id="verifyPassword" />
      <div data-automation-id="click_filter" id="account-filter">Create Account</div>
    </form>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'account-filter')

  doc.body.innerHTML = `
    <div id="card">
      <input data-automation-id="email" />
      <input data-automation-id="password" />
      <input data-automation-id="verifyPassword" />
    </div>
    <button data-automation-id="click_filter" id="next">Next</button>
  `
  assert.equal(workdayAccountSubmitControl(doc), null)
})

test('Zillow create-account uses bare inputs, the checkbox, and a click_filter submit', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a data-automation-id="signInLink" id="sign-in">Sign In</a>
    <button data-automation-id="utilityButtonSignIn" id="utility-sign-in">Sign In</button>
    <button data-automation-id="click_filter" id="next">Next</button>
    <form id="account">
      <input data-automation-id="email" id="email-input" />
      <input data-automation-id="password" id="password-input" type="password" />
      <input data-automation-id="verifyPassword" id="verify-input" type="password" />
      <input data-automation-id="createAccountCheckbox" id="agree" type="checkbox" />
      <button data-automation-id="click_filter" id="account-filter">Create Account</button>
    </form>
  </body>`)
  const doc = dom.window.document
  const fields = workdayAccountInputs(doc)
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(fields.email?.id, 'email-input')
  assert.equal(fields.password?.id, 'password-input')
  assert.equal(fields.verifyPassword?.id, 'verify-input')
  assert.equal(doc.querySelector('[data-automation-id="createAccountSubmitButton"]'), null)
  assert.equal(workdayAccountAgreementCheckbox(doc)?.id, 'agree')
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'account-filter')
})

test('Salesforce formField wrappers are the account form and the fill targets', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a data-automation-id="signInLink" id="sign-in">Sign In</a>
    <button data-automation-id="click_filter" id="next">Next</button>
    <div data-automation-id="formField-emailAddress"><input id="info-email" /></div>
    <div data-automation-id="formField-email"><input id="email-input" /></div>
    <input data-automation-id="email" id="bare-email" />
    <div data-automation-id="formField-password"><input id="password-input" type="password" /></div>
    <div data-automation-id="formField-verifyPassword"><input id="verify-input" type="password" /></div>
    <input data-automation-id="createAccountCheckbox" id="agree" type="checkbox" />
    <button data-automation-id="createAccountSubmitButton" id="create-submit">Create Account</button>
  </body>`)
  const doc = dom.window.document
  const fields = workdayAccountInputs(doc)
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(fields.email?.id, 'email-input')
  assert.equal(fields.password?.id, 'password-input')
  assert.equal(fields.verifyPassword?.id, 'verify-input')
  assert.equal(workdayFieldControl(doc, 'emailAddress')?.id, 'info-email')
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayCreateAccountLink(doc), null)
  assert.equal(workdayAccountAgreementCheckbox(doc)?.id, 'agree')
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'create-submit')
})

test('a later formField wrapper wins over an empty one', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-email"></div>
    <div data-automation-id="formField-email"><input id="real-email" /></div>
    <input data-automation-id="email" id="bare-email" />
    <div data-automation-id="formField-password"><input id="password-input" /></div>
    <div data-automation-id="formField-verifyPassword"><input id="verify-input" /></div>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdayAccountInputs(doc).email?.id, 'real-email')
  assert.equal(isWorkdayAccountCreationForm(doc), true)
})

test('empty formField wrappers fall back to bare account inputs', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-email"></div>
    <div data-automation-id="formField-password"></div>
    <div data-automation-id="formField-verifyPassword"></div>
    <input data-automation-id="email" id="bare-email" />
    <input data-automation-id="password" id="bare-password" />
    <input data-automation-id="verifyPassword" id="bare-verify" />
  </body>`)
  const doc = dom.window.document
  const fields = workdayAccountInputs(doc)
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(fields.email?.id, 'bare-email')
  assert.equal(fields.password?.id, 'bare-password')
  assert.equal(fields.verifyPassword?.id, 'bare-verify')
})

test('formField account wrappers without inputs are not the create-account form', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-email"></div>
    <div data-automation-id="formField-password"></div>
    <div data-automation-id="formField-verifyPassword"></div>
    <div data-automation-id="formField-emailAddress"><input id="info-email" /></div>
  </body>`)
  const doc = dom.window.document
  assert.equal(isWorkdayAccountCreationForm(doc), false)
  assert.equal(workdayAccountInputs(doc).email, null)
  assert.equal(workdayAccountSubmitControl(doc), null)
})

test('Salesforce click_filter fallback stays inside the formField account card', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="click_filter" id="next">Next</button>
    <div id="card">
      <div data-automation-id="formField-email"><input id="email-input" /></div>
      <div data-automation-id="formField-password"><input id="password-input" type="password" /></div>
      <div data-automation-id="formField-verifyPassword"><input id="verify-input" type="password" /></div>
      <div data-automation-id="click_filter" id="account-filter">Create Account</div>
    </div>
  </body>`)
  const doc = dom.window.document
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(workdayAccountSubmitControl(doc)?.id, 'account-filter')
})

test('Salesforce /login fills the visible password and does not navigate away', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a data-automation-id="signInLink" id="sign-in">Sign In</a>
    <a data-automation-id="createAccountLink" id="create">Create Account</a>
    <button data-automation-id="signInSubmitButton" id="submit-sign-in">Sign In</button>
    <div data-automation-id="formField-email"><input id="email-input" type="text" /></div>
    <input data-automation-id="password" id="decoy" type="text" aria-hidden="true" tabindex="-1" />
    <div data-automation-id="formField-password">
      <input id="hidden-password" type="password" aria-hidden="true" />
      <input id="password-input" type="password" aria-label="Password" />
    </div>
    <div data-automation-id="formField-emailAddress"><input id="info-email" type="email" /></div>
  </body>`)
  const doc = dom.window.document
  const fields = workdayAccountInputs(doc)
  assert.equal(isWorkdayAccountCreationForm(doc), false)
  assert.equal(isWorkdaySignInForm(doc), true)
  assert.equal(fields.email?.id, 'email-input')
  assert.equal(fields.password?.id, 'password-input')
  assert.equal(fields.verifyPassword, null)
  assert.equal(workdaySignInInputs(doc).password?.id, 'password-input')
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayCreateAccountLink(doc), null)
  assert.equal(workdayAccountCredentialKind(doc.getElementById('password-input')!), 'password')
  assert.equal(workdayAccountCredentialKind(doc.getElementById('decoy')!), null)
  assert.equal(workdayAccountCredentialKind(doc.getElementById('info-email')!), null)
  assert.equal(workdayAccountCredentialKind(doc.getElementById('email-input')!), 'email')
  assert.equal(doc.getElementById('submit-sign-in')?.id, 'submit-sign-in')
})

test('Zillow /login uses the shared sign-in form and ignores a hidden create-account block', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <a data-automation-id="signInLink" id="sign-in-link">Sign In</a>
      <button data-automation-id="utilityButtonSignIn" id="utility-sign-in">Sign In</button>
      <a data-automation-id="createAccountLink" id="create">Create Account</a>
      <div hidden id="register">
        <input data-automation-id="email" id="reg-email" type="text" />
        <input data-automation-id="password" id="reg-password" type="password" />
        <input data-automation-id="verifyPassword" id="reg-verify" type="password" />
        <button data-automation-id="click_filter" id="reg-submit">Create Account</button>
      </div>
      <form id="login">
        <div data-automation-id="email"><input id="email-input" type="text" autocomplete="username" /></div>
        <div data-automation-id="password">
          <input id="password-input" type="password" autocomplete="current-password" />
        </div>
        <div data-automation-id="click_filter" id="sign-in-click" role="button" aria-label="Sign In">Sign In</div>
        <button data-automation-id="signInSubmitButton" id="sign-in-submit" aria-hidden="true">Sign In</button>
      </form>
    </body>`,
    { url: 'https://zillow.wd5.myworkdayjobs.com/en-US/Zillow_Group_External/login' },
  )
  const doc = dom.window.document
  let signInClicks = 0
  for (const id of ['sign-in-link', 'utility-sign-in', 'sign-in-click', 'sign-in-submit', 'create', 'reg-submit']) {
    doc.getElementById(id)?.addEventListener('click', () => {
      signInClicks += 1
    })
  }
  const fields = workdayAccountInputs(doc)
  assert.equal(isWorkdayAccountCreationForm(doc), false)
  assert.equal(isWorkdaySignInForm(doc), true)
  assert.equal(fields.email?.id, 'email-input')
  assert.equal(fields.password?.id, 'password-input')
  assert.equal(fields.verifyPassword, null)
  assert.equal(workdaySignInInputs(doc).password?.id, 'password-input')
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayCreateAccountLink(doc), null)
  assert.equal(workdayAccountSubmitControl(doc), null)
  assert.equal(workdayAccountCredentialKind(doc.getElementById('password-input')!), 'password')
  assert.equal(workdayAccountCredentialKind(doc.getElementById('reg-password')!), null)
  assert.equal(workdayAccountCredentialKind(doc.getElementById('email-input')!), 'email')

  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const email = doc.getElementById('email-input') as HTMLInputElement
  const password = doc.getElementById('password-input') as HTMLInputElement
  const info = {
    email: 'person@example.com',
    accountPassword: '',
    applicationAccounts: [
      {
        id: 1,
        portal: 'Workday',
        email: 'acct@example.com',
        password: 'zillow-secret',
        requireConfirmation: false,
      },
    ],
  } as PersonalInfo
  assert.equal(await rule.apply(email, 'email', info), true)
  assert.equal(email.value, 'acct@example.com')
  assert.equal(await rule.apply(password, 'password', info), true)
  assert.equal(password.value, 'zillow-secret')
  assert.equal((doc.getElementById('reg-password') as HTMLInputElement).value, '')
  assert.equal(signInClicks, 0)
})

test('signInLink is a sign-in control only off the create-account form', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a data-automation-id="signInLink" id="sign-in">Sign In</a>
  </body>`)
  const doc = dom.window.document
  assert.equal(doc.querySelector(WORKDAY_SIGN_IN_LINK_SELECTOR)?.id, 'sign-in')
  assert.equal(isWorkdayAccountCreationForm(doc), false)
  assert.equal(workdaySignInWithEmailButton(doc)?.id, 'sign-in')

  doc.body.insertAdjacentHTML(
    'beforeend',
    `<div data-automation-id="formField-email"><input id="email-input" /></div>
     <div data-automation-id="formField-password"><input id="password-input" /></div>
     <div data-automation-id="formField-verifyPassword"><input id="verify-input" /></div>`,
  )
  assert.equal(isWorkdayAccountCreationForm(doc), true)
  assert.equal(workdaySignInWithEmailButton(doc), null)
})

test('sign-in and create-account selectors match the current and older controls', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="signInWithEmailButton" id="old-sign-in"></button>
    <a data-automation-id="createAccountLink" id="create"></a>
  </body>`)
  const doc = dom.window.document
  assert.equal(doc.querySelector(WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR)?.id, 'old-sign-in')
  assert.equal(workdaySignInWithEmailButton(doc)?.id, 'old-sign-in')
  assert.equal(workdayCreateAccountLink(doc)?.id, 'create')
  doc.body.innerHTML = `<button data-automation-id="SignInWithEmailButton" id="new-sign-in"></button>`
  assert.equal(doc.querySelector(WORKDAY_SIGN_IN_WITH_EMAIL_SELECTOR)?.id, 'new-sign-in')
  assert.equal(workdaySignInWithEmailButton(doc)?.id, 'new-sign-in')
  doc.body.innerHTML = `
    <button data-automation-id="SignInWithEmailButton" id="new-sign-in"></button>
    <a data-automation-id="createAccountLink" id="create"></a>
    <input data-automation-id="email" />
    <input data-automation-id="password" />
    <input data-automation-id="verifyPassword" />
    <input data-automation-id="createAccountCheckbox" id="agree" type="checkbox" />
  `
  assert.equal(workdaySignInWithEmailButton(doc), null)
  assert.equal(workdayCreateAccountLink(doc), null)
  assert.equal(workdayAccountAgreementCheckbox(doc)?.id, 'agree')
  doc.body.innerHTML = `<div data-automation-id="createAccountCheckbox" id="not-input"></div>`
  assert.equal(workdayAccountAgreementCheckbox(doc), null)
  doc.body.innerHTML = `<a data-automation-id="createAccountLink" id="create"></a>`
  assert.equal(doc.querySelector(WORKDAY_CREATE_ACCOUNT_SELECTOR)?.id, 'create')
})

test('experience and education sections follow the heading, not only the English aria id', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div role="group" aria-labelledby="Professional-Experience-section">
      <h3 id="Professional-Experience-section">Professional Experience</h3>
      <button data-automation-id="add-button" id="add-exp">Add</button>
    </div>
    <div role="group" aria-labelledby="Education-section">
      <h3 id="Education-section">Education</h3>
      <button data-automation-id="add-button" id="add-edu">Add</button>
    </div>
    <div role="group" aria-labelledby="Professional-Experience-1-panel">
      <h4 id="Professional-Experience-1-panel">Professional Experience 1</h4>
    </div>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdaySectionKindFromLabel('My Experience 1'), 'experience')
  assert.equal(workdaySectionKindFromLabel('Education'), 'education')
  assert.equal(findWorkdaySectionAddButton(doc, 'experience')?.id, 'add-exp')
  assert.equal(findWorkdaySectionAddButton(doc, 'education')?.id, 'add-edu')
  assert.equal(listWorkdayPanels(doc, 'experience').length, 1)
  assert.equal(listWorkdayPanels(doc, 'education').length, 0)
})

test('form signature watches My Info inputs and only the My Experience page id', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="applyFlowPage">
      <div data-automation-id="applyFlowMyInfoPage">
        <input id="name--legalName--firstName" />
      </div>
    </div>
  </body>`)
  const doc = dom.window.document
  const first = nextWorkdayFormSignature(doc)
  assert.equal(first, 'applyFlowMyInfoPage:[INPUT:name--legalName--firstName]')
  doc.querySelector('[data-automation-id="applyFlowMyInfoPage"]')?.insertAdjacentHTML(
    'beforeend',
    '<input id="name--legalName--lastName" />',
  )
  assert.notEqual(nextWorkdayFormSignature(doc), first)

  doc.body.innerHTML = `
    <div data-automation-id="applyFlowPage">
      <div data-automation-id="applyFlowMyExpPage">
        <input id="job-title" />
      </div>
    </div>
  `
  assert.equal(nextWorkdayFormSignature(doc), 'applyFlowMyExpPage')
  doc.querySelector('[data-automation-id="applyFlowMyExpPage"]')?.insertAdjacentHTML(
    'beforeend',
    '<input id="company" />',
  )
  assert.equal(nextWorkdayFormSignature(doc), 'applyFlowMyExpPage')
  doc.body.innerHTML = `<div data-automation-id="applyFlowMyInfoPage"></div>`
  assert.equal(nextWorkdayFormSignature(doc), null)
})

test('date parts accept the canvas -input suffix and the short automation id', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="signed">
      <input data-automation-id="dateSectionMonth-input" id="month" />
      <div data-automation-id="dateSectionDay"><input id="day" /></div>
      <input data-automation-id="dateSectionYear" id="year" />
    </div>
  </body>`)
  const scope = dom.window.document.getElementById('signed')!
  assert.equal(workdayDatePartInput(scope, 'month')?.id, 'month')
  assert.equal(workdayDatePartInput(scope, 'day')?.id, 'day')
  assert.equal(workdayDatePartInput(scope, 'year')?.id, 'year')
})

test('dropdown labels match state abbreviations and phone device types', () => {
  assert.equal(matchingOptionText(['Select One', 'California', 'Colorado'], 'CA', 'state'), 'California')
  assert.equal(matchingOptionText(['New York', 'New Jersey'], 'New_York', 'state'), 'New York')
  assert.equal(
    matchingOptionText(['United States of America', 'Canada'], 'United States', 'country'),
    'United States of America',
  )
  assert.equal(workdayPhoneTypeOption(['Work', 'Home', 'Mobile']), 'Mobile')
  assert.equal(workdayPhoneTypeOption(['Landline', 'Cell Phone']), 'Cell Phone')
  assert.equal(workdayPhoneTypeOption(['Landline', 'Cellular Phone']), 'Cellular Phone')
  assert.equal(workdayPhoneTypeOption(['Work', 'Fax']), null)
  assert.equal(workdayPhoneTypeOption(['Georgia', 'United States of America']), null)
})

test('united_states selects United States of America and not the country Georgia', () => {
  const options = ['Select One', 'Georgia', 'Germany', 'United States of America', 'Canada']
  assert.equal(matchingOptionText(options, 'united_states', 'country'), 'United States of America')
  assert.equal(matchingOptionText(options, 'USA', 'country'), 'United States of America')
  assert.equal(matchingOptionText(['Georgia', 'Germany', 'Canada'], 'united_states', 'country'), null)
  assert.equal(workdayListedValueMatches('Georgia', 'united_states', 'country'), false)
  assert.equal(workdayListedValueMatches('United States of America', 'united_states', 'country'), true)
  assert.equal(workdayListedSearchText('united_states', 'country'), 'united states')
  assert.equal(workdayListedSearchText('CA', 'state'), 'california')
  assert.equal(
    workdaySelectValue(
      [
        { value: 'GE', text: 'Georgia' },
        { value: 'US', text: 'United States of America' },
      ],
      'united_states',
      'country',
    ),
    'US',
  )
  assert.equal(
    workdaySelectValue(
      [
        { value: 'land', text: 'Landline' },
        { value: 'mob', text: 'Mobile' },
      ],
      '',
      'phone',
    ),
    'mob',
  )
})

test('disability options match labels instead of a fixed index', () => {
  const labels = [
    'No, I do not have a disability and have not had one in the past',
    'Yes, I have a disability, or have had one in the past',
    'I do not want to answer',
  ]
  assert.equal(workdayDisabilityOptionIndex(labels, 'yes'), 1)
  assert.equal(workdayDisabilityOptionIndex(labels, 'no'), 0)
  assert.equal(workdayDisabilityOptionIndex(labels, 'decline'), 2)
})

test('experience location skips missing city or state', () => {
  assert.equal(workdayExperienceLocation('Austin', 'TX'), 'Austin, TX')
  assert.equal(workdayExperienceLocation('Austin', ''), 'Austin')
  assert.equal(workdayExperienceLocation(undefined, undefined), '')
})

test('Cisco prompts expose country and phone device options without role=option', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="country" name="country" aria-haspopup="listbox" aria-controls="country-list">
      <span data-automation-id="promptSelectionLabel">Georgia</span>
    </button>
    <div id="country-list" role="listbox">
      <div data-automation-id="promptOption" data-automation-label="Georgia">Georgia</div>
      <div data-automation-id="promptOption" data-automation-label="United States of America">United States of America</div>
    </div>
    <button id="state" name="countryRegion" aria-haspopup="listbox" aria-controls="state-list"></button>
    <div id="state-list" role="listbox">
      <div role="option">Georgia</div>
      <div role="option">California</div>
    </div>
    <button data-automation-id="phone-device-type" id="device">Select One</button>
    <div data-automation-id="responsiveMonikerPrompt" id="phone-menu">
      <div data-automation-id="promptOption" data-automation-label="Landline">Landline</div>
      <div data-automation-id="promptOption" data-automation-label="Mobile">Mobile</div>
      <div data-automation-id="promptOption" data-automation-label="Fax">Fax</div>
    </div>
  </body>`)
  const doc = dom.window.document
  const countryButton = doc.getElementById('country') as HTMLButtonElement
  const stateButton = doc.getElementById('state') as HTMLButtonElement
  assert.equal(workdayListboxValue(countryButton), 'Georgia')
  assert.equal(workdayListedValueMatches(workdayListboxValue(countryButton), 'united_states', 'country'), false)
  const countryPrompt = workdayActivePrompt(countryButton)!
  assert.equal(
    matchingOptionText(workdayOptionLabels(countryPrompt), 'united_states', 'country'),
    'United States of America',
  )
  assert.equal(workdayOptionElement(countryPrompt, 'United States of America')?.parentElement?.id, 'country-list')
  const statePrompt = workdayActivePrompt(stateButton)!
  assert.equal(statePrompt, doc.getElementById('state-list'))
  assert.equal(matchingOptionText(workdayOptionLabels(statePrompt), 'Georgia', 'state'), 'Georgia')
  assert.equal(workdayOptionElement(statePrompt, 'Georgia')?.parentElement?.id, 'state-list')
  assert.equal(workdayPhoneDeviceTypeButton(doc)?.id, 'device')
  assert.equal(workdayPhoneTypeOption(workdayOptionLabels(doc.getElementById('phone-menu')!)), 'Mobile')
  assert.equal(workdayListboxButton(doc, 'countryRegion')?.id, 'state')
})

test('address selects are country, state, and phone device type', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <select id="address--country"></select>
    <select id="addressSection_countryRegion"></select>
    <select id="phone-device-type"></select>
    <select id="countryPhoneCode"></select>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdaySelectKind(doc.getElementById('address--country')!), 'country')
  assert.equal(workdaySelectKind(doc.getElementById('addressSection_countryRegion')!), 'state')
  assert.equal(workdaySelectKind(doc.getElementById('phone-device-type')!), 'phone')
  assert.equal(workdaySelectKind(doc.getElementById('countryPhoneCode')!), null)
  assert.equal(workdayIsFormerEmployeeQuestion('have you ever been a cisco employee or do you have an email id'), true)
  assert.equal(workdayIsFormerEmployeeQuestion('are you a previous employee of zillow'), true)
  assert.equal(workdayIsFormerEmployeeQuestion('have you worked here before'), true)
  assert.equal(workdayIsFormerEmployeeQuestion('are you a current or former employee'), true)
  assert.equal(workdayIsFormerEmployeeQuestion('i currently work here'), false)
  assert.equal(workdayIsFormerEmployeeQuestion('emailaddress'), false)
  assert.equal(
    workdayIsFormerEmployeeQuestion(
      'have you ever been employed by or provided services to a foreign government entity in any capacity',
    ),
    false,
  )
  assert.equal(
    workdayIsFormerEmployeeQuestion(
      'do you have a family relationship with a u.s. government or foreign government official',
    ),
    false,
  )
})

test('required source and former-employee defaults use a listed option and never Yes', () => {
  const sourceOptions = [
    'Select One',
    'LinkedIn',
    'Indeed',
    'Job Board',
    'Employee Referral',
    'Company Website',
    'Other',
  ]
  assert.equal(workdaySourceOption(sourceOptions), 'Other')
  assert.equal(workdayPreferredSourceOption(sourceOptions), 'Other')
  assert.equal(workdaySourceOption(['LinkedIn', 'Indeed', 'Company Website', 'Career Site']), 'Company Website')
  assert.equal(workdaySourceOption(['LinkedIn', 'Career Site', 'Zillow Careers']), 'Career Site')
  assert.equal(workdaySourceOption(['LinkedIn', 'Indeed', 'Cisco Careers']), 'Cisco Careers')
  assert.equal(workdaySourceOption(["Company's Website", 'Glassdoor']), "Company's Website")
  assert.equal(workdayPreferredSourceOption(['LinkedIn', 'Indeed', 'Job Board']), null)
  assert.equal(workdaySourceOption(['LinkedIn', 'Indeed', 'Job Board']), 'Job Board')
  assert.equal(workdaySourceOption(['LinkedIn', 'Indeed', 'Job Board', 'Advertisement']), 'Advertisement')
  assert.equal(workdaySourceOption(['Indeed']), 'Indeed')
  assert.equal(workdaySourceOption(['Employee Referral', 'Yes']), null)
  assert.equal(workdaySourceOption(['Select One']), null)

  assert.equal(workdaySafeNoOption(['Select One', 'Yes', 'No']), 'No')
  assert.equal(workdaySafeNoOption(['Yes', 'No, I have not worked here']), 'No, I have not worked here')
  assert.equal(workdaySafeNoOption(['Yes', 'No', 'I do not want to answer']), 'No')
  assert.equal(workdaySafeNoOption(['Yes']), null)
  assert.equal(workdaySafeNoOption(['Yes', 'I do not wish to answer']), null)
  assert.equal(workdaySourceOption(['Yes', 'No']), 'No')
})

test('source apply handler does not click an Indeed option', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <input id="source" data-automation-id="source" />
      <div data-automation-id="promptOption" id="indeed">Indeed</div>
    </body>`,
    { url: 'https://nvidia.wd5.myworkdayjobs.com/apply' },
  )
  let clicked = false
  dom.window.document.getElementById('indeed')?.addEventListener('click', () => {
    clicked = true
  })
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const input = dom.window.document.querySelector('input')!
  const handled = await rule.apply(input, 'howdidyouhearaboutus', {} as PersonalInfo)
  assert.equal(handled, true)
  assert.equal(clicked, false)
})

test('sign-in password comes from the Workday application account, not the legacy field', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <div data-automation-id="formField-email"><input id="email-input" type="text" value="" /></div>
      <input data-automation-id="password" id="decoy" type="password" style="display:none" />
      <input id="password-input" type="password" aria-label="Password" value="" />
    </body>`,
    { url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/login' },
  )
  const doc = dom.window.document
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const email = doc.getElementById('email-input') as HTMLInputElement
  const password = doc.getElementById('password-input') as HTMLInputElement
  const decoy = doc.getElementById('decoy') as HTMLInputElement
  const info = {
    email: 'person@example.com',
    accountPassword: '',
    applicationAccounts: [
      {
        id: 1,
        portal: 'Workday',
        email: 'acct@example.com',
        password: 'salesforce-secret',
        requireConfirmation: false,
      },
    ],
  } as PersonalInfo
  assert.equal(await rule.apply(email, 'email', info), true)
  assert.equal(email.value, 'acct@example.com')
  assert.equal(await rule.apply(password, 'password', info), true)
  assert.equal(password.value, 'salesforce-secret')
  assert.equal(decoy.value, '')
  assert.equal(await rule.apply(decoy, 'password', info), false)
})

test('country select maps united_states to United States and former-employee selects No', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <select id="address--country">
        <option value="">Select One</option>
        <option value="GE">Georgia</option>
        <option value="US">United States of America</option>
      </select>
      <select id="former-employee">
        <option value="">Select One</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <select id="phone-device-type">
        <option value="">Select One</option>
        <option value="land">Landline</option>
        <option value="mob">Mobile</option>
      </select>
    </body>`,
    { url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/apply' },
  )
  const doc = dom.window.document
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const country = doc.getElementById('address--country') as HTMLSelectElement
  const former = doc.getElementById('former-employee') as HTMLSelectElement
  const phone = doc.getElementById('phone-device-type') as HTMLSelectElement
  const info = { country: 'united_states', state: 'Georgia', email: 'ada@example.com' } as PersonalInfo
  assert.equal(await rule.apply(country, 'country', info), true)
  assert.equal(country.value, 'US')
  assert.equal(
    await rule.apply(former, 'haveyoueverbeenaciscoemployeeordoyouhaveanemailid', info),
    true,
  )
  assert.equal(former.value, 'no')
  assert.equal(await rule.apply(phone, 'phonedevicetype', info), true)
  assert.equal(phone.value, 'mob')
})

test('how did you hear selects a listed option and does not invent Yes or a referral', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <select id="source" data-automation-id="source">
        <option value="">Select One</option>
        <option value="li">LinkedIn</option>
        <option value="in">Indeed</option>
        <option value="jb">Job Board</option>
        <option value="ref">Employee Referral</option>
        <option value="web">Company Website</option>
        <option value="oth">Other</option>
      </select>
      <select id="career-only">
        <option value="">Select One</option>
        <option value="li">LinkedIn</option>
        <option value="careers">Zillow Careers</option>
      </select>
      <select id="yes-only">
        <option value="">Select One</option>
        <option value="yes">Yes</option>
      </select>
      <fieldset>
        <legend>Are you a previous employee?</legend>
        <input type="radio" name="previousEmployee" id="prev-yes" value="yes" />
        <label for="prev-yes">Yes</label>
        <input type="radio" name="previousEmployee" id="prev-no" value="no" />
        <label for="prev-no">No</label>
      </fieldset>
      <fieldset>
        <legend>Have you worked here before?</legend>
        <input type="radio" name="workedHere" id="worked-yes" value="1" />
        <label for="worked-yes">Yes</label>
        <input type="radio" name="workedHere" id="worked-no" value="0" />
        <label for="worked-no">No</label>
      </fieldset>
    </body>`,
    { url: 'https://zillow.wd5.myworkdayjobs.com/en-US/Zillow_Group_External/apply' },
  )
  const doc = dom.window.document
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const info = { country: 'united_states' } as PersonalInfo
  const source = doc.getElementById('source') as HTMLSelectElement
  const careers = doc.getElementById('career-only') as HTMLSelectElement
  const yesOnly = doc.getElementById('yes-only') as HTMLSelectElement
  assert.equal(await rule.apply(source, 'howdidyouhearaboutus', info), true)
  assert.equal(source.value, 'oth')
  assert.equal(await rule.apply(careers, 'howdidyouhearaboutus', info), true)
  assert.equal(careers.value, 'careers')
  assert.equal(await rule.apply(yesOnly, 'areyouapreviousemployee', info), true)
  assert.equal(yesOnly.value, '')
  const yes = doc.getElementById('prev-yes') as HTMLInputElement
  const no = doc.getElementById('prev-no') as HTMLInputElement
  assert.equal(await rule.apply(yes, 'areyouapreviousemployee', info), true)
  assert.equal(yes.checked, false)
  assert.equal(await rule.apply(no, 'areyouapreviousemployee', info), true)
  assert.equal(no.checked, true)
  assert.equal(yes.checked, false)
  const workedYes = doc.getElementById('worked-yes') as HTMLInputElement
  const workedNo = doc.getElementById('worked-no') as HTMLInputElement
  assert.equal(await rule.apply(workedYes, 'haveyouworkedherebefore', info), true)
  assert.equal(workedYes.checked, false)
  assert.equal(await rule.apply(workedNo, 'haveyouworkedherebefore', info), true)
  assert.equal(workedNo.checked, true)
})

test('My Information listboxes for source and former employee are not the country control', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="country" name="country" aria-haspopup="listbox" aria-controls="country-list">
      <span data-automation-id="promptSelectionLabel">United States of America</span>
    </button>
    <div data-automation-id="formField-question1">
      <label id="source-label">How Did You Hear About Us?</label>
      <button id="source-btn" aria-haspopup="listbox" aria-labelledby="source-label">
        <span data-automation-id="promptSelectionLabel">Select One</span>
      </button>
    </div>
    <div data-automation-id="formField-previousWorker">
      <label id="former-label">Are you a previous employee?</label>
      <button id="former-btn" aria-haspopup="listbox" aria-labelledby="former-label">
        <span data-automation-id="promptSelectionLabel">Select One</span>
      </button>
    </div>
    <button id="phone" data-automation-id="phone-device-type" aria-haspopup="listbox">Select One</button>
  </body>`)
  const doc = dom.window.document
  assert.equal(workdaySourceListboxButton(doc)?.id, 'source-btn')
  assert.equal(workdayFormerEmployeeListboxButton(doc)?.id, 'former-btn')
  assert.equal(workdayListboxIsEmpty(doc.getElementById('source-btn')!), true)
  assert.equal(workdayListboxIsEmpty(doc.getElementById('country')!), false)
  assert.equal(workdayPhoneDeviceTypeButton(doc)?.id, 'phone')
})

test('phone device type stays Mobile or Cell and is not a source or former-employee question', async () => {
  assert.equal(workdayPhoneTypeOption(['Landline', 'Fax', 'Mobile']), 'Mobile')
  assert.equal(workdayPhoneTypeOption(['Fax', 'Cell', 'Landline']), 'Cell')
  assert.equal(workdayPhoneTypeOption(['Work', 'Home', 'Mobile']), 'Mobile')
  assert.equal(workdaySourceOption(['Mobile', 'Landline', 'Fax']), null)
  assert.equal(workdayPreferredSourceOption(['Mobile', 'Landline', 'Fax']), null)
  assert.equal(workdaySourceOption(['Select One', 'Mobile', 'Landline', 'Fax']), null)
  assert.equal(workdaySourceOption(['LinkedIn', 'Indeed', 'Cisco Jobs Career Site']), 'Cisco Jobs Career Site')
  assert.equal(workdayPreferredSourceOption(['LinkedIn', 'Cisco Jobs Career Site']), 'Cisco Jobs Career Site')
  assert.equal(workdaySafeNoOption(['Select One', 'Yes', 'No']), 'No')
  assert.equal(workdaySourceOption(['Yes', 'No']), 'No')
  assert.equal(workdaySafeNoOption(['Yes']), null)

  const dom = new JSDOM(`<!doctype html><body>
    <div data-fkit-id="myInformation">
      <label>How Did You Hear About Us?</label>
      <div data-automation-id="phone-device-type">
        <button id="phone-btn" data-automation-id="promptIcon" aria-haspopup="listbox" aria-expanded="true">
          <span data-automation-id="promptSelectionLabel">Select One</span>
        </button>
      </div>
      <label id="source-label">How Did You Hear About Us?</label>
      <button id="source-btn" aria-haspopup="listbox" aria-expanded="true" aria-labelledby="source-label">
        <span data-automation-id="promptSelectionLabel">Select One</span>
      </button>
      <div data-automation-id="formField-previousWorker">
        <label id="former-label">Are you a former Cisco employee or do you have an email ID?</label>
        <button id="former-btn" aria-haspopup="listbox" aria-labelledby="former-label">
          <span data-automation-id="promptSelectionLabel">Select One</span>
        </button>
      </div>
    </div>
    <div id="source-menu" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" data-automation-label="LinkedIn">LinkedIn</div>
      <div data-automation-id="promptOption" data-automation-label="Cisco Jobs Career Site">Cisco Jobs Career Site</div>
    </div>
    <div id="phone-menu" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" data-automation-label="Landline">Landline</div>
      <div data-automation-id="promptOption" data-automation-label="Mobile">Mobile</div>
      <div data-automation-id="promptOption" data-automation-label="Fax">Fax</div>
    </div>
  </body>`)
  const doc = dom.window.document
  const phone = doc.getElementById('phone-btn')!
  const source = doc.getElementById('source-btn')!
  const former = doc.getElementById('former-btn')!
  assert.equal(workdayElementIsPhoneDeviceType(phone), true)
  assert.equal(workdayElementIsPhoneDeviceType(source), false)
  assert.equal(workdayElementIsPhoneDeviceType(former), false)
  assert.equal(workdayElementIsSource(phone, 'howdidyouhearaboutus'), false)
  assert.equal(workdayElementIsFormerEmployee(phone, 'areyouaformerciscoemployeeordoyouhaveanemailid'), false)
  assert.equal(workdayElementIsSource(source, 'howdidyouhearaboutus'), true)
  assert.equal(workdayElementIsFormerEmployee(former, 'areyouaformerciscoemployeeordoyouhaveanemailid'), true)
  assert.equal(workdayPhoneDeviceTypeButton(doc)?.id, 'phone-btn')
  assert.equal(workdaySourceListboxButton(doc)?.id, 'source-btn')
  assert.equal(workdayFormerEmployeeListboxButton(doc)?.id, 'former-btn')
  assert.equal(workdayPhoneTypeOption(workdayOptionLabels(doc.getElementById('phone-menu')!)), 'Mobile')
  // Source menu is open and listed first. The device-type button still resolves
  // to Mobile/Landline/Fax, and the source button does not take that menu.
  assert.equal(workdayActivePrompt(source)?.id, 'source-menu')

  const phoneMenuLast = new JSDOM(`<!doctype html><body>
    <button id="phone-type" data-automation-id="phoneType" aria-haspopup="listbox" aria-expanded="true">Select One</button>
    <div id="careers-menu" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" data-automation-label="Cisco Jobs Career Site">Cisco Jobs Career Site</div>
    </div>
    <div id="device-menu" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" data-automation-label="Fax">Fax</div>
      <div data-automation-id="promptOption" data-automation-label="Cell">Cell</div>
    </div>
  </body>`)
  const phoneType = phoneMenuLast.window.document.getElementById('phone-type')!
  assert.equal(workdayElementIsSource(phoneType, 'howdidyouhearaboutus'), false)
  assert.equal(workdayElementIsFormerEmployee(phoneType, 'previousemployee'), false)
  assert.equal(workdayActivePrompt(phoneType)?.id, 'device-menu')
  assert.equal(
    workdayPhoneTypeOption(workdayOptionLabels(phoneMenuLast.window.document.getElementById('device-menu')!)),
    'Cell',
  )

  const selectDom = new JSDOM(
    `<!doctype html><body>
      <select id="phone-device-type">
        <option value="">Select One</option>
        <option value="land">Landline</option>
        <option value="mob">Mobile</option>
        <option value="fax">Fax</option>
      </select>
      <select id="phoneType">
        <option value="">Select One</option>
        <option value="land">Landline</option>
        <option value="cell">Cell</option>
        <option value="fax">Fax</option>
      </select>
      <select id="source">
        <option value="">Select One</option>
        <option value="li">LinkedIn</option>
        <option value="careers">Cisco Jobs Career Site</option>
        <option value="yes">Yes</option>
      </select>
      <select id="former-employee">
        <option value="">Select One</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </body>`,
    { url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/apply' },
  )
  const selectDoc = selectDom.window.document
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const info = { country: 'united_states' } as PersonalInfo
  const phoneSelect = selectDoc.getElementById('phone-device-type') as HTMLSelectElement
  const cellSelect = selectDoc.getElementById('phoneType') as HTMLSelectElement
  const sourceSelect = selectDoc.getElementById('source') as HTMLSelectElement
  const formerSelect = selectDoc.getElementById('former-employee') as HTMLSelectElement
  assert.equal(workdayElementIsSource(phoneSelect, 'howdidyouhearaboutus'), false)
  assert.equal(workdayElementIsFormerEmployee(phoneSelect, 'areyouaformerciscoemployee'), false)
  assert.equal(workdayElementIsSource(cellSelect, 'howdidyouhearaboutus'), false)
  assert.equal(await rule.apply(phoneSelect, 'howdidyouhearaboutus', info), true)
  assert.equal(phoneSelect.value, 'mob')
  assert.equal(await rule.apply(cellSelect, 'phonedevicetype', info), true)
  assert.equal(cellSelect.value, 'cell')
  assert.equal(await rule.apply(sourceSelect, 'howdidyouhearaboutus', info), true)
  assert.equal(sourceSelect.value, 'careers')
  assert.notEqual(sourceSelect.value, 'yes')
  assert.equal(
    await rule.apply(formerSelect, 'haveyoueverbeenaciscoemployeeordoyouhaveanemailid', info),
    true,
  )
  assert.equal(formerSelect.value, 'no')
  assert.notEqual(formerSelect.value, 'yes')
})

test('education school and degree options match the listed prompt row', () => {
  assert.equal(
    workdaySuggestionOption(
      ['Kenyon College', 'Kennesaw State University'],
      'Kennesaw State University',
    ),
    'Kennesaw State University',
  )
  assert.equal(workdaySuggestionOption(['Kenyon College', 'State University'], 'Kennesaw State University'), null)
  assert.equal(
    workdaySuggestionOption(['Kennesaw State University - Kennesaw, Georgia'], 'Kennesaw State University'),
    'Kennesaw State University - Kennesaw, Georgia',
  )
  assert.equal(
    workdayDegreeOption(['Master of Science', 'Bachelor of Science'], 'Bachelor of Science'),
    'Bachelor of Science',
  )
  assert.equal(
    workdayDegreeOption(["Master's Degree", "Bachelor's Degree"], 'Bachelor of Science'),
    "Bachelor's Degree",
  )
  assert.equal(workdayDegreeOption(['Bachelors', 'Masters'], 'Bachelor of Science'), 'Bachelors')
  assert.equal(workdayDegreeOption(['B.S.', 'M.S.'], 'Bachelor of Science'), 'B.S.')
  assert.equal(workdayDegreeOption(['Bachelor of Arts', 'Master of Science'], 'Bachelor of Science'), null)
  assert.equal(workdayDegreeOption(['Mobile', 'Landline', 'Fax'], 'Bachelor of Science'), null)
})

test('education prompts select the matching school suggestion and degree list option', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-schoolName">
      <input id="school" data-automation-id="searchBox" aria-controls="school-menu" value="" />
    </div>
    <div id="school-menu" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" id="kenyon" data-automation-label="Kenyon College">Kenyon College</div>
      <div data-automation-id="promptOption" id="ksu" data-automation-label="Kennesaw State University"></div>
    </div>
    <button id="degree" name="degree" aria-haspopup="listbox" aria-controls="degree-list">Select One</button>
    <div id="degree-list" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" id="ms" data-automation-label="Master of Science">Master of Science</div>
      <div data-automation-id="promptOption" id="bs" data-automation-label="Bachelor of Science">Bachelor of Science</div>
    </div>
    <button id="degree-generic" name="degree" aria-haspopup="listbox" aria-controls="degree-generic-list">Select One</button>
    <div id="degree-generic-list" data-automation-id="responsiveMonikerPrompt">
      <div data-automation-id="promptOption" id="masters" data-automation-label="Masters">Masters</div>
      <div data-automation-id="promptOption" id="bachelors" data-automation-label="Bachelor's Degree">Bachelor's Degree</div>
    </div>
  </body>`)
  const doc = dom.window.document
  const clicked: string[] = []
  for (const id of ['kenyon', 'ksu', 'ms', 'bs', 'masters', 'bachelors']) {
    doc.getElementById(id)!.addEventListener('click', () => clicked.push(id))
  }
  let entered = false
  doc.getElementById('school')!.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') entered = true
  })
  const { selectWorkdayListedDegree, selectWorkdayPromptQuery } = await import('./workday.ts')
  const school = doc.getElementById('school') as HTMLInputElement
  assert.equal(await selectWorkdayPromptQuery(school, 'Kennesaw State University'), true)
  assert.deepEqual(clicked, ['ksu'])
  assert.equal(entered, false)
  const degree = doc.getElementById('degree') as HTMLButtonElement
  assert.equal(await selectWorkdayListedDegree(degree, 'Bachelor of Science'), 'Bachelor of Science')
  assert.deepEqual(clicked, ['ksu', 'bs'])
  const generic = doc.getElementById('degree-generic') as HTMLButtonElement
  assert.equal(await selectWorkdayListedDegree(generic, 'Bachelor of Science'), "Bachelor's Degree")
  assert.deepEqual(clicked, ['ksu', 'bs', 'bachelors'])
})

test('degree option target is the visible row, not the prompt wrapper', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="degree-list">
      <div data-automation-id="promptOption" id="bs-prompt" data-automation-label="Bachelor of Science">
        <div role="option" id="bs-empty"></div>
        <div id="bs-row">Bachelor of Science</div>
      </div>
      <div data-automation-id="promptOption" id="ba-prompt" data-automation-label="Bachelor of Arts">
        <div id="ba-row">Bachelor of Arts</div>
      </div>
    </div>
  </body>`)
  const list = dom.window.document.getElementById('degree-list')!
  assert.equal(workdayOptionLabels(list).includes('Bachelor of Science'), true)
  assert.equal(workdayOptionElement(list, 'Bachelor of Science')?.id, 'bs-row')
  assert.notEqual(workdayOptionElement(list, 'Bachelor of Science')?.id, 'bs-prompt')
  assert.notEqual(workdayOptionElement(list, 'Bachelor of Science')?.id, 'bs-empty')
  assert.equal(workdayDegreeOption(workdayOptionLabels(list), 'Bachelor of Science'), 'Bachelor of Science')
})

test('open degree menu selects the visible Bachelor of Science row after the rows exist', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="degree" name="degree" aria-haspopup="listbox" aria-expanded="false" aria-controls="degree-anchor">
      <span data-automation-id="promptSelectionLabel">Select One</span>
    </button>
    <div id="degree-anchor"></div>
  </body>`)
  const doc = dom.window.document
  const button = doc.getElementById('degree') as HTMLButtonElement
  const targets: string[] = []
  let buttonClicks = 0
  button.addEventListener('click', () => {
    buttonClicks += 1
    if (button.getAttribute('aria-expanded') === 'true') {
      button.setAttribute('aria-expanded', 'false')
      doc.getElementById('degree-popup')?.remove()
      return
    }
    button.setAttribute('aria-expanded', 'true')
    setTimeout(() => {
      const popup = doc.createElement('div')
      popup.id = 'degree-popup'
      popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
      popup.innerHTML = `
        <div data-automation-id="promptOption" data-automation-label="Select One"><div>Select One</div></div>
        <div data-automation-id="promptOption" data-automation-label="Doctor of Medicine (MD)"><div>Doctor of Medicine (MD)</div></div>
        <div data-automation-id="promptOption" data-automation-label="Associate of Science"><div>Associate of Science</div></div>
        <div data-automation-id="promptOption" id="ba-prompt" data-automation-label="Bachelor of Arts"><div id="ba-row">Bachelor of Arts</div></div>
        <div data-automation-id="promptOption" id="bs-prompt" data-automation-label="Bachelor of Science">
          <div role="option" id="bs-empty"></div>
          <div id="bs-row">Bachelor of Science</div>
        </div>
        <div data-automation-id="promptOption" data-automation-label="Doctor of Medicine"><div>Doctor of Medicine</div></div>
        <div data-automation-id="promptOption" data-automation-label="Juris Doctorate"><div>Juris Doctorate</div></div>
      `
      popup.addEventListener('mousedown', (event) => {
        targets.push((event.target as HTMLElement).id || '')
      })
      doc.body.appendChild(popup)
    }, 200)
  })
  const { selectWorkdayListedDegree } = await import('./workday.ts')
  assert.equal(await selectWorkdayListedDegree(button, 'Bachelor of Science'), 'Bachelor of Science')
  assert.deepEqual(targets, ['bs-row'])
  assert.equal(targets.includes('ba-row'), false)
  assert.equal(buttonClicks, 1)
  assert.equal(button.getAttribute('aria-expanded'), 'true')
})

test('school suggestion commits the visible row and does not blur before that click', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-schoolName">
      <input id="school" aria-controls="school-anchor" value="" />
    </div>
    <div id="school-anchor"></div>
  </body>`)
  const doc = dom.window.document
  const school = doc.getElementById('school') as HTMLInputElement
  const targets: string[] = []
  let dismissed = false
  school.addEventListener('change', () => {
    school.blur()
  })
  school.addEventListener('blur', () => {
    dismissed = true
    doc.getElementById('school-popup')?.remove()
  })
  school.addEventListener('input', () => {
    setTimeout(() => {
      if (dismissed) return
      const popup = doc.createElement('div')
      popup.id = 'school-popup'
      popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
      popup.innerHTML = `
        <div data-automation-id="promptOption" data-automation-label="Kenyon College"><div id="kenyon-row">Kenyon College</div></div>
        <div data-automation-id="promptOption" id="ksu-prompt" data-automation-label="Kennesaw State University">
          <div id="ksu-row">Kennesaw State University</div>
        </div>
      `
      popup.addEventListener('mousedown', (event) => {
        targets.push((event.target as HTMLElement).id || '')
      })
      doc.body.appendChild(popup)
    }, 120)
  })
  let entered = false
  school.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') entered = true
  })
  const { selectWorkdayPromptQuery } = await import('./workday.ts')
  assert.equal(await selectWorkdayPromptQuery(school, 'Kennesaw State University'), true)
  assert.deepEqual(targets, ['ksu-row'])
  assert.equal(dismissed, false)
  assert.equal(entered, false)
  assert.equal(doc.getElementById('school-popup') != null, true)
})

// Cisco's school prompt does not search from the closed field. Opening the
// multiselect paints a Search box and "No Items." The catalog query is that
// search box. A matching row commits on the promptLeafNode; the visible label
// does not. The selected value is a pill, not the typed query.
function ciscoSchoolPrompt(catalog: string[]) {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-school" data-fkit-id="education-1--school">
      <div data-automation-id="multiSelectContainer" id="school-field"></div>
      <div data-automation-id="selectedItemList" id="school-pills"></div>
    </div>
  </body>`)
  const doc = dom.window.document
  const field = doc.getElementById('school-field')!
  const clicked: string[] = []
  const searches: string[] = []
  const open = () => {
    if (doc.getElementById('school-popup')) return
    const popup = doc.createElement('div')
    popup.id = 'school-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    popup.setAttribute('data-automation-type', 'singleSelectPrompt')
    popup.innerHTML = `
      <div data-automation-id="monikerSearchBox">
        <input data-automation-id="searchBox" id="school-search" placeholder="Search" value="" />
      </div>
      <div id="school-results"></div>
    `
    const search = popup.querySelector('#school-search') as HTMLInputElement
    const results = popup.querySelector('#school-results')!
    const paint = (query: string) => {
      searches.push(query)
      const schools = catalog.filter((label) => query && label.toLowerCase().includes(query.toLowerCase()))
      const rows = schools.length > 0 ? schools : ['No Items.']
      results.replaceChildren()
      for (const label of rows) {
        const leaf = doc.createElement('div')
        leaf.setAttribute('data-automation-id', 'promptLeafNode')
        leaf.id = label === 'No Items.' ? 'no-items-leaf' : `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-leaf`
        const option = doc.createElement('div')
        option.setAttribute('data-automation-id', 'promptOption')
        option.setAttribute('data-automation-label', label)
        const text = doc.createElement('div')
        text.textContent = label
        text.addEventListener('mousedown', (event) => event.stopPropagation())
        text.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
        })
        option.appendChild(text)
        leaf.appendChild(option)
        if (label !== 'No Items.') {
          leaf.addEventListener('click', () => {
            clicked.push(label)
            const pill = doc.createElement('div')
            pill.setAttribute('data-automation-id', 'selectedItem')
            pill.textContent = label
            doc.getElementById('school-pills')!.replaceChildren(pill)
            search.value = ''
          })
        }
        results.appendChild(leaf)
      }
    }
    search.addEventListener('input', () => paint(search.value.trim()))
    paint('')
    doc.body.appendChild(popup)
  }
  field.addEventListener('click', open)
  return { doc, field, clicked, searches, open }
}

test('Cisco school prompt types the profile school into the search and clicks that leaf', async () => {
  const { doc, field, clicked, searches } = ciscoSchoolPrompt([
    'Kenyon College',
    'Kennesaw State University',
  ])
  const { selectWorkdayPromptQuery } = await import('./workday.ts')
  assert.equal(await selectWorkdayPromptQuery(field, 'Kennesaw State University'), true)
  assert.equal(searches.includes('Kennesaw State University'), true)
  assert.deepEqual(clicked, ['Kennesaw State University'])
  assert.equal(clicked.includes('Kenyon College'), false)
  assert.equal(doc.getElementById('school-pills')?.textContent, 'Kennesaw State University')
})

test('Cisco school prompt types into the prompt search when the field input is not that box', async () => {
  const { doc, field, clicked, searches } = ciscoSchoolPrompt([
    'Kenyon College',
    'Kennesaw State University',
  ])
  const decoy = doc.createElement('input')
  decoy.id = 'school-decoy'
  decoy.value = ''
  field.appendChild(decoy)
  const { selectWorkdayPromptQuery } = await import('./workday.ts')
  assert.equal(await selectWorkdayPromptQuery(decoy, 'Kennesaw State University'), true)
  assert.equal(decoy.value, '')
  assert.equal(searches.includes('Kennesaw State University'), true)
  assert.deepEqual(clicked, ['Kennesaw State University'])
})

test('Cisco school prompt leaves school blank when the catalog has no match', async () => {
  const { doc, field, clicked, searches } = ciscoSchoolPrompt(['Kenyon College'])
  const { selectWorkdayPromptQuery } = await import('./workday.ts')
  assert.equal(await selectWorkdayPromptQuery(field, 'Kennesaw State University'), false)
  assert.equal(searches.includes('Kennesaw State University'), true)
  assert.deepEqual(clicked, [])
  assert.equal(doc.getElementById('school-pills')?.textContent, '')
  assert.equal((doc.getElementById('school-search') as HTMLInputElement).value, '')
})

test('Cisco degree menu selects the visible Bachelor of Science row', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-degree" data-fkit-id="education-1--degree">
      <button id="degree" aria-haspopup="listbox" aria-expanded="false">Select One</button>
    </div>
  </body>`)
  const doc = dom.window.document
  const button = doc.getElementById('degree') as HTMLButtonElement
  const chosen: string[] = []
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') {
      button.setAttribute('aria-expanded', 'false')
      doc.getElementById('degree-menu')?.remove()
      return
    }
    button.setAttribute('aria-expanded', 'true')
    const menu = doc.createElement('div')
    menu.id = 'degree-menu'
    menu.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    menu.innerHTML = `
      <div data-automation-id="promptLeafNode" id="no-items-leaf">
        <div data-automation-id="promptOption" data-automation-label="No Items.">No Items.</div>
      </div>
    `
    doc.body.appendChild(menu)
    setTimeout(() => {
      if (!menu.isConnected) return
      menu.replaceChildren()
      for (const label of [
        'Select One',
        'Doctor of Medicine (MD)',
        'Associate of Science',
        'Bachelor of Science',
        'Doctor of Medicine',
        'Juris Doctorate',
      ]) {
        const leaf = doc.createElement('div')
        leaf.setAttribute('data-automation-id', 'promptLeafNode')
        leaf.setAttribute('role', 'option')
        leaf.id = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-leaf`
        const option = doc.createElement('div')
        option.setAttribute('data-automation-id', 'promptOption')
        option.setAttribute('data-automation-label', label)
        const text = doc.createElement('div')
        text.textContent = label
        text.addEventListener('mousedown', (event) => event.stopPropagation())
        text.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
        })
        option.appendChild(text)
        leaf.appendChild(option)
        leaf.addEventListener('click', () => {
          if (label === 'Select One') return
          chosen.push(label)
          button.textContent = label
        })
        menu.appendChild(leaf)
      }
    }, 180)
  })
  const { selectWorkdayListedDegree } = await import('./workday.ts')
  assert.equal(await selectWorkdayListedDegree(button, 'Bachelor of Science'), 'Bachelor of Science')
  assert.deepEqual(chosen, ['Bachelor of Science'])
  assert.equal(button.textContent, 'Bachelor of Science')
})

// The closed school box can show the typed query. That is not a selected school.
// Cisco's catalog search runs on Enter when typeahead is off, and the committed
// value is the pill. A pill that is already the profile school stays as it is.
test('Cisco school prompt commits the catalog pill and does not keep typed text', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="formField-school" data-fkit-id="education-1--school">
      <div data-automation-id="multiSelectContainer">
        <input id="school-input" value="" />
        <span data-automation-id="promptIcon" id="school-icon"></span>
      </div>
      <div data-automation-id="selectedItemList" id="school-pills" role="listbox"></div>
    </div>
  </body>`)
  const doc = dom.window.document
  const input = doc.getElementById('school-input') as HTMLInputElement
  const pills = doc.getElementById('school-pills')!
  let opened = false
  const open = () => {
    if (opened) return
    opened = true
    input.setAttribute('data-automation-id', 'searchBox')
    const popup = doc.createElement('div')
    popup.id = 'school-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    popup.setAttribute('data-automation-type', 'singleSelectPrompt')
    const results = doc.createElement('div')
    results.id = 'school-results'
    popup.appendChild(results)
    const paint = () => {
      results.replaceChildren()
      const query = input.value.trim().toLowerCase()
      const schools = ['Kenyon College', 'Kennesaw State University'].filter(
        (label) => query && label.toLowerCase().includes(query),
      )
      for (const label of schools) {
        const leaf = doc.createElement('div')
        leaf.setAttribute('data-automation-id', 'promptLeafNode')
        leaf.id = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-leaf`
        const option = doc.createElement('div')
        option.setAttribute('data-automation-id', 'promptOption')
        option.setAttribute('data-automation-label', label)
        const text = doc.createElement('div')
        text.textContent = label
        text.addEventListener('mousedown', (event) => event.stopPropagation())
        text.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
        })
        option.appendChild(text)
        leaf.appendChild(option)
        leaf.addEventListener('click', () => {
          const pill = doc.createElement('div')
          pill.setAttribute('data-automation-id', 'selectedItem')
          pill.textContent = label
          pills.replaceChildren(pill)
          input.value = ''
          popup.remove()
        })
        results.appendChild(leaf)
      }
    }
    input.addEventListener('keyup', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') paint()
    })
    doc.body.appendChild(popup)
  }
  doc.getElementById('school-icon')!.addEventListener('click', open)
  const { selectWorkdayPromptQuery } = await import('./workday.ts')
  assert.equal(await selectWorkdayPromptQuery(input, 'Kennesaw State University'), true)
  assert.equal(pills.textContent, 'Kennesaw State University')
  assert.equal(input.value, '')
  assert.equal(opened, true)

  const again = await selectWorkdayPromptQuery(input, 'Kennesaw State University')
  assert.equal(again, true)
  assert.equal(pills.textContent, 'Kennesaw State University')
})

// A selected-pill listbox is already on the page (source, company, school).
// The degree menu is the Canvas list that opens after the button click.
// "Select One" is not the choice. Associate of Science is a different degree.
test('Cisco degree list commits Bachelor of Science while another listbox is open', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="selectedItemList" id="source-pills" role="listbox">
      <div data-automation-id="selectedItem">Cisco Jobs Career Site</div>
    </div>
    <div data-automation-id="formField-degree" data-fkit-id="education-1--degree">
      <button id="degree" type="button" aria-haspopup="listbox" aria-expanded="false">Select One</button>
    </div>
  </body>`)
  const doc = dom.window.document
  const button = doc.getElementById('degree') as HTMLButtonElement
  const chosen: string[] = []
  const rows = [
    'Select One',
    'Doctor of Medicine (MD)',
    'Associate of Science',
    'Bachelor of Science',
    'Doctor of Medicine',
    'Juris Doctorate',
  ]
  let focus = 0
  const openMenu = () => {
    if (doc.getElementById('degree-menu')) return
    button.setAttribute('aria-expanded', 'true')
    button.setAttribute('aria-controls', 'degree-menu')
    const menu = doc.createElement('ul')
    menu.id = 'degree-menu'
    menu.setAttribute('role', 'listbox')
    menu.setAttribute('aria-activedescendant', `degree-opt-${focus}`)
    rows.forEach((label, index) => {
      const option = doc.createElement('li')
      option.setAttribute('role', 'option')
      option.id = `degree-opt-${index}`
      const text = doc.createElement('div')
      text.textContent = label
      text.addEventListener('mousedown', (event) => event.stopPropagation())
      text.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      option.appendChild(text)
      // A synthetic mousedown on the row dismisses the Canvas menu before click.
      // A real pointer click still selects; keyboard Enter on the focused row does too.
      option.addEventListener('mousedown', () => {
        menu.remove()
        button.setAttribute('aria-expanded', 'false')
        button.removeAttribute('aria-controls')
      })
      menu.appendChild(option)
    })
    doc.body.appendChild(menu)
  }
  button.addEventListener('click', () => {
    setTimeout(() => openMenu(), 40)
  })
  button.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key !== 'ArrowDown' && key !== 'Enter') return
    const menu = doc.getElementById('degree-menu')
    if (!menu) {
      if (key === 'ArrowDown') openMenu()
      return
    }
    if (key === 'ArrowDown') {
      focus = Math.min(rows.length - 1, focus + 1)
      menu.setAttribute('aria-activedescendant', `degree-opt-${focus}`)
      return
    }
    const label = rows[focus]
    if (!label || label === 'Select One') return
    chosen.push(label)
    button.textContent = label
    button.setAttribute('aria-expanded', 'false')
    menu.remove()
  })
  const { selectWorkdayListedDegree } = await import('./workday.ts')
  assert.equal(await selectWorkdayListedDegree(button, 'Bachelor of Science'), 'Bachelor of Science')
  assert.deepEqual(chosen, ['Bachelor of Science'])
  assert.equal(button.textContent, 'Bachelor of Science')
  assert.equal(chosen.includes('Associate of Science'), false)
  assert.equal(chosen.includes('Bachelor of Arts'), false)
})

// Cisco's Canvas select updates the closed label from its own key handler.
// Writing an option id into the hidden input leaves the label on Select One.
// Bachelor of Arts is listed before Bachelor of Science, so the first "B"
// would commit the wrong degree. The full name is required.
test('Cisco degree closed label follows typeahead of the full degree name', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-automation-id="selectedItemList" role="listbox">
      <div data-automation-id="selectedItem">Kennesaw State University</div>
    </div>
    <div data-automation-id="formField-degree" data-fkit-id="education-1--degree">
      <button id="degree" type="button" aria-haspopup="listbox" aria-expanded="false">Select One</button>
      <input id="degree-value" type="text" value="" />
    </div>
  </body>`)
  const doc = dom.window.document
  const button = doc.getElementById('degree') as HTMLButtonElement
  const input = doc.getElementById('degree-value') as HTMLInputElement
  const labels = [
    'Select One',
    'Doctor of Medicine (MD)',
    'Associate of Science',
    'Bachelor of Arts',
    'Bachelor of Science',
    'Doctor of Medicine',
    'Juris Doctorate',
  ]
  let keys = ''
  let focus = 0
  let open = false
  const matchFrom = (start: number, text: string): number => {
    for (let index = start; index < labels.length; index++) {
      if (index === 0) continue
      if (labels[index].toLowerCase().indexOf(text.toLowerCase()) === 0) return index
    }
    return -1
  }
  const typeahead = (character: string) => {
    const start = keys.length === 0 ? focus + 1 : focus
    keys += character
    let index = matchFrom(start >= labels.length ? 0 : start, keys)
    if (index < 0) index = matchFrom(0, keys)
    if (index < 0) return
    if (open) focus = index
    else button.textContent = labels[index]
  }
  button.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key.length === 1 && /\S/.test(key)) {
      typeahead(key)
      return
    }
    if ((key === ' ' || key === 'Spacebar') && keys) {
      typeahead(' ')
      return
    }
    if (key === 'ArrowDown' || key === 'Down') {
      if (!open) open = true
      return
    }
    if (key === 'Enter' && open && focus > 0) button.textContent = labels[focus]
  })
  input.addEventListener('input', () => {})
  input.addEventListener('change', () => {})
  input.value = 'bs'
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  assert.equal(button.textContent, 'Select One')
  input.value = ''
  const { selectWorkdayListedDegree } = await import('./workday.ts')
  assert.equal(await selectWorkdayListedDegree(button, 'Bachelor of Science'), 'Bachelor of Science')
  assert.equal(button.textContent, 'Bachelor of Science')
  assert.notEqual(button.textContent, 'Select One')
  assert.notEqual(button.textContent, 'Associate of Science')
  assert.notEqual(button.textContent, 'Bachelor of Arts')
})

test('application questions use a saved profile answer and leave the rest unanswered', () => {
  assert.equal(
    workdayApplicationQuestionKind(
      null,
      'Are you legally authorized to work in any of the posted location for this requisition?',
    ),
    'authorized',
  )
  assert.equal(
    workdayApplicationQuestionKind(
      null,
      'Will you now or in the future require sponsorship for an employment visa for any of the posted locations?',
    ),
    'sponsorship',
  )
  assert.equal(
    workdayApplicationQuestionKind(
      null,
      'How many years of relevant work experience related to this position do you have?',
    ),
    'years',
  )
  assert.equal(
    workdayApplicationQuestionKind(null, 'foreign government entity in any capacity'),
    'government',
  )
  assert.equal(
    workdayApplicationQuestionKind(
      null,
      'Do you have a family relationship with a U.S. Government or Foreign Government Official?',
    ),
    'government',
  )
  assert.equal(workdayProfileChoice('authorized', { workAuthorization: '' }), null)
  assert.equal(workdayProfileChoice('sponsorship', {}), null)
  assert.equal(workdayProfileChoice('authorized', { workAuthorization: 'us_citizen' }), 'yes')
  assert.equal(workdayProfileChoice('authorized', { workAuthorization: 'need_sponsorship' }), 'no')
  assert.equal(
    workdayProfileChoice('sponsorship', { workAuthorization: 'us_citizen', sponsorshipRequired: 'No' }),
    'no',
  )
  assert.equal(workdayProfileChoice('sponsorship', { sponsorshipRequired: 'Yes' }), 'yes')
  assert.equal(
    workdayListedProfileOption(['Select One', 'Yes', 'No'], 'authorized', { workAuthorization: 'us_citizen' }),
    'Yes',
  )
  assert.equal(
    workdayListedProfileOption(['Select One', 'I am authorized'], 'authorized', { workAuthorization: 'us_citizen' }),
    null,
  )
})

test('Cisco application questions commit a saved answer on the closed label', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  const options = ['Select One', 'Yes', 'No']
  const install = (id: string, question: string) => {
    const field = doc.createElement('div')
    field.setAttribute('data-automation-id', `formField-${id}`)
    const label = doc.createElement('label')
    label.textContent = question
    const button = doc.createElement('button')
    button.type = 'button'
    button.id = id
    button.setAttribute('aria-haspopup', 'listbox')
    button.setAttribute('aria-expanded', 'false')
    button.textContent = 'Select One'
    const input = doc.createElement('input')
    input.type = 'text'
    input.id = `${id}-value`
    field.append(label, button, input)
    doc.body.appendChild(field)
    let keys = ''
    let focus = 0
    let open = false
    const matchFrom = (start: number, text: string) => {
      for (let index = start; index < options.length; index++) {
        if (index === 0) continue
        if (options[index].toLowerCase().indexOf(text.toLowerCase()) === 0) return index
      }
      return -1
    }
    const typeahead = (character: string) => {
      const start = keys.length === 0 ? focus + 1 : focus
      keys += character
      let index = matchFrom(start >= options.length ? 0 : start, keys)
      if (index < 0) index = matchFrom(0, keys)
      if (index < 0) return
      if (open) focus = index
      else button.textContent = options[index]
    }
    button.addEventListener('click', () => {
      if (doc.getElementById(`${id}-menu`)) return
      open = true
      button.setAttribute('aria-expanded', 'true')
      button.setAttribute('aria-controls', `${id}-menu`)
      const menu = doc.createElement('ul')
      menu.id = `${id}-menu`
      menu.setAttribute('role', 'listbox')
      for (const option of options) {
        const row = doc.createElement('li')
        row.setAttribute('role', 'option')
        row.textContent = option
        menu.appendChild(row)
      }
      doc.body.appendChild(menu)
    })
    button.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key
      if (key.length === 1 && /\S/.test(key)) {
        typeahead(key)
        return
      }
      if (key === 'Enter' && open && focus > 0) button.textContent = options[focus]
    })
    input.addEventListener('input', () => {})
    input.addEventListener('change', () => {})
    return { button, input }
  }
  const authorized = install(
    'authorized',
    'Are you legally authorized to work in any of the posted location for this requisition?',
  )
  const sponsorship = install(
    'sponsorship',
    'Will you now or in the future require sponsorship for an employment visa for any of the posted locations?',
  )
  const government = install(
    'government',
    'Have you ever been employed by a foreign government entity in any capacity?',
  )
  const family = install(
    'family',
    'Do you have a family relationship with a U.S. Government or Foreign Government Official?',
  )
  const yearsField = doc.createElement('div')
  yearsField.setAttribute('data-automation-id', 'formField-years')
  const yearsLabel = doc.createElement('label')
  yearsLabel.textContent = 'How many years of relevant work experience related to this position do you have?'
  const years = doc.createElement('input')
  years.type = 'text'
  years.id = 'years'
  yearsField.append(yearsLabel, years)
  doc.body.appendChild(yearsField)
  const profile = { workAuthorization: 'us_citizen', sponsorshipRequired: 'No' }
  const { fillWorkdayApplicationQuestions, workdayApplicationApply } = await import('./workday.ts')
  assert.equal(await workdayApplicationApply(years, yearsLabel.textContent, profile), 'skip')
  assert.equal(years.value, '')
  assert.equal(await workdayApplicationApply(authorized.input, '', profile), true)
  assert.equal(authorized.button.textContent, 'Yes')
  await fillWorkdayApplicationQuestions(doc.body, profile)
  assert.equal(sponsorship.button.textContent, 'No')
  assert.equal(government.button.textContent, 'Select One')
  assert.equal(family.button.textContent, 'Select One')
  assert.equal(years.value, '')
  assert.notEqual(authorized.button.textContent, 'Select One')
  assert.notEqual(sponsorship.button.textContent, 'Select One')
  assert.notEqual(authorized.button.textContent, 'No')
  assert.notEqual(sponsorship.button.textContent, 'Yes')
  const blank = new JSDOM('<!doctype html><body></body>')
  const blankDoc = blank.window.document
  const blankField = blankDoc.createElement('div')
  blankField.setAttribute('data-automation-id', 'formField-blank-auth')
  const blankLabel = blankDoc.createElement('label')
  blankLabel.textContent = 'Are you legally authorized to work in any of the posted location for this requisition?'
  const blankButton = blankDoc.createElement('button')
  blankButton.type = 'button'
  blankButton.setAttribute('aria-haspopup', 'listbox')
  blankButton.textContent = 'Select One'
  blankButton.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key === 'Y') blankButton.textContent = 'Yes'
    if (key === 'N') blankButton.textContent = 'No'
  })
  blankField.append(blankLabel, blankButton)
  blankDoc.body.appendChild(blankField)
  await fillWorkdayApplicationQuestions(blankDoc.body, { workAuthorization: '', sponsorshipRequired: '' })
  assert.equal(blankButton.textContent, 'Select One')
})

test('Cisco application questions are found when the menu never opens', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  const question = (id: string, text: string) => {
    const field = doc.createElement('div')
    field.setAttribute('data-automation-id', `formField-${id}`)
    const box = doc.createElement('fieldset')
    const legend = doc.createElement('legend')
    const rich = doc.createElement('div')
    rich.textContent = text
    legend.appendChild(rich)
    const button = doc.createElement('button')
    button.type = 'button'
    button.id = id
    button.setAttribute('aria-haspopup', 'listbox')
    button.textContent = 'Select One'
    const input = doc.createElement('input')
    input.type = 'text'
    input.id = `${id}-value`
    input.style.display = 'none'
    box.append(legend, button, input)
    field.appendChild(box)
    doc.body.appendChild(field)
    // Click does not paint rows. The closed button commits Yes or No itself.
    button.addEventListener('click', (event) => event.preventDefault())
    button.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key
      if (key === 'Y') button.textContent = 'Yes'
      if (key === 'N') button.textContent = 'No'
    })
    return { button, input }
  }
  const authorized = question(
    'authorized',
    'Are you legally authorized to work in any of the posted location for this requisition?',
  )
  const sponsorship = question(
    'sponsorship',
    'Will you now or in the future require sponsorship for an employment visa for any of the posted locations?',
  )
  const government = question(
    'government',
    'Have you ever been employed by a foreign government entity in any capacity?',
  )
  const family = question(
    'family',
    'Do you have a family relationship with a U.S. Government or Foreign Government Official?',
  )
  const yearsField = doc.createElement('div')
  yearsField.setAttribute('data-automation-id', 'formField-years')
  const yearsLegend = doc.createElement('legend')
  yearsLegend.textContent = 'How many years of relevant work experience related to this position do you have?'
  const years = doc.createElement('input')
  years.type = 'text'
  years.id = 'years'
  yearsField.append(yearsLegend, years)
  doc.body.appendChild(yearsField)
  const { workdayQuestionAutofillResult } = await import('./workday.ts')
  const profile = { workAuthorization: 'us_citizen', sponsorshipRequired: 'No' }
  const result = await workdayQuestionAutofillResult(doc.body, profile)
  assert.notEqual(result.message, 'No matching fields found')
  assert.equal(authorized.button.textContent, 'Yes')
  assert.equal(sponsorship.button.textContent, 'No')
  assert.equal(government.button.textContent, 'Select One')
  assert.equal(family.button.textContent, 'Select One')
  assert.equal(years.value, '')
  assert.notEqual(authorized.button.textContent, 'Select One')
  assert.notEqual(sponsorship.button.textContent, 'Select One')
})

test('a second work experience autofill does not append a job already on the page', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  let nextPanel = 1
  let adds = 0

  const section = doc.createElement('div')
  section.setAttribute('role', 'group')
  section.setAttribute('aria-labelledby', 'Work-Experience-section')
  const heading = doc.createElement('h3')
  heading.id = 'Work-Experience-section'
  heading.textContent = 'Work Experience'
  const add = doc.createElement('button')
  add.type = 'button'
  add.id = 'add-exp'
  add.setAttribute('data-automation-id', 'add-button')
  add.textContent = 'Add'
  section.append(heading, add)
  doc.body.appendChild(section)

  const textField = (metadataId: string, value = '') => {
    const wrap = doc.createElement('div')
    wrap.setAttribute('data-automation-id', `formField-${metadataId}`)
    const input = doc.createElement('input')
    input.value = value
    wrap.appendChild(input)
    return { wrap, input }
  }
  const dateField = (metadataId: string, month = '', year = '') => {
    const wrap = doc.createElement('div')
    wrap.setAttribute('data-automation-id', `formField-${metadataId}`)
    const monthInput = doc.createElement('input')
    monthInput.setAttribute('data-automation-id', 'dateSectionMonth-input')
    monthInput.value = month
    const yearInput = doc.createElement('input')
    yearInput.setAttribute('data-automation-id', 'dateSectionYear-input')
    yearInput.value = year
    wrap.append(monthInput, yearInput)
    return wrap
  }
  const buildPanel = (title: string, company: string, fromMonth = '', fromYear = '') => {
    const n = nextPanel++
    const panel = doc.createElement('div')
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-labelledby', `Work-Experience-${n}-panel`)
    const label = doc.createElement('h4')
    label.id = `Work-Experience-${n}-panel`
    label.textContent = `Work Experience ${n}`
    const currentWrap = doc.createElement('div')
    currentWrap.setAttribute('data-automation-id', 'formField-currentlyWorkHere')
    const current = doc.createElement('input')
    current.type = 'checkbox'
    currentWrap.appendChild(current)
    panel.append(
      label,
      textField('jobTitle', title).wrap,
      textField('companyName', company).wrap,
      dateField('startDate', fromMonth, fromYear),
      dateField('endDate'),
      currentWrap,
    )
    doc.body.appendChild(panel)
    return panel
  }

  add.addEventListener('click', () => {
    adds += 1
    buildPanel('', '')
  })

  // The required section starts with one empty row. The profile has two jobs.
  buildPanel('', '')
  const profile = {
    experience: [
      {
        id: 1,
        jobTitle: 'Full Stack Developer',
        companyName: 'American Reading Company',
        startDate: '2021-12',
        description: '',
        present: true,
      },
      {
        id: 2,
        jobTitle: 'Software Engineer',
        companyName: 'Northwind Labs',
        startDate: '2019-01',
        endDate: '2021-06',
        description: '',
      },
    ],
  } as PersonalInfo

  const { fillWorkdayWorkExperience } = await import('./workday.ts')
  await fillWorkdayWorkExperience(doc, profile)
  assert.equal(listWorkdayPanels(doc, 'experience').length, 2)
  const addsAfterFirst = adds
  await fillWorkdayWorkExperience(doc, profile)
  assert.equal(adds, addsAfterFirst)
  assert.equal(listWorkdayPanels(doc, 'experience').length, 2)

  const panels = listWorkdayPanels(doc, 'experience')
  const titleOf = (panel: Element) => (workdayFieldControl(panel, 'jobTitle') as HTMLInputElement).value
  const companyOf = (panel: Element) => (workdayFieldControl(panel, 'companyName') as HTMLInputElement).value
  assert.deepEqual(panels.map(titleOf).sort(), ['Full Stack Developer', 'Software Engineer'])
  assert.deepEqual(panels.map(companyOf).sort(), ['American Reading Company', 'Northwind Labs'])

  const fullStack = panels.find((panel) => titleOf(panel) === 'Full Stack Developer')!
  const fullStackTo = fullStack.querySelector('[data-automation-id="formField-endDate"]')!
  assert.equal(workdayDatePartInput(fullStackTo, 'month')?.value, '')
  assert.equal(workdayDatePartInput(fullStackTo, 'year')?.value, '')
  assert.equal((fullStack.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, true)

  const northwind = panels.find((panel) => titleOf(panel) === 'Software Engineer')!
  const northwindTo = northwind.querySelector('[data-automation-id="formField-endDate"]')!
  assert.equal(workdayDatePartInput(northwindTo, 'month')?.value, '06')
  assert.equal(workdayDatePartInput(northwindTo, 'year')?.value, '2021')
})

test('work experience autofill does not copy a job into a blank row that is already represented', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  let nextPanel = 1
  let adds = 0
  const section = doc.createElement('div')
  section.setAttribute('role', 'group')
  section.setAttribute('aria-labelledby', 'Work-Experience-section')
  const heading = doc.createElement('h3')
  heading.id = 'Work-Experience-section'
  heading.textContent = 'Work Experience'
  const add = doc.createElement('button')
  add.type = 'button'
  add.setAttribute('data-automation-id', 'add-button')
  add.textContent = 'Add'
  section.append(heading, add)
  doc.body.appendChild(section)
  add.addEventListener('click', () => {
    adds += 1
  })

  const panel = (title: string, company: string, fromMonth = '', fromYear = '') => {
    const n = nextPanel++
    const group = doc.createElement('div')
    group.setAttribute('role', 'group')
    group.setAttribute('aria-labelledby', `Work-Experience-${n}-panel`)
    const label = doc.createElement('h4')
    label.id = `Work-Experience-${n}-panel`
    label.textContent = `Work Experience ${n}`
    const field = (metadataId: string, value = '') => {
      const wrap = doc.createElement('div')
      wrap.setAttribute('data-automation-id', `formField-${metadataId}`)
      const input = doc.createElement('input')
      input.value = value
      wrap.appendChild(input)
      return wrap
    }
    const dates = (metadataId: string, month: string, year: string) => {
      const wrap = doc.createElement('div')
      wrap.setAttribute('data-automation-id', `formField-${metadataId}`)
      const monthInput = doc.createElement('input')
      monthInput.setAttribute('data-automation-id', 'dateSectionMonth-input')
      monthInput.value = month
      const yearInput = doc.createElement('input')
      yearInput.setAttribute('data-automation-id', 'dateSectionYear-input')
      yearInput.value = year
      wrap.append(monthInput, yearInput)
      return wrap
    }
    group.append(
      label,
      field('jobTitle', title),
      field('companyName', company),
      dates('startDate', fromMonth, fromYear),
      dates('endDate', '', ''),
    )
    doc.body.appendChild(group)
  }

  panel('Full Stack Developer', 'American Reading Company', '12', '2021')
  panel('Software Engineer', 'Northwind Labs', '01', '2019')
  panel('', '', '12', '2021')

  const { fillWorkdayWorkExperience } = await import('./workday.ts')
  await fillWorkdayWorkExperience(doc, {
    experience: [
      {
        id: 1,
        jobTitle: 'Full Stack Developer',
        companyName: 'American Reading Company',
        startDate: '2021-12',
        description: '',
        present: true,
      },
      {
        id: 2,
        jobTitle: 'Software Engineer',
        companyName: 'Northwind Labs',
        startDate: '2019-01',
        endDate: '2021-06',
        description: '',
      },
    ],
  } as PersonalInfo)

  assert.equal(adds, 0)
  assert.equal(listWorkdayPanels(doc, 'experience').length, 3)
  const blank = listWorkdayPanels(doc, 'experience').find(
    (group) => !(workdayFieldControl(group, 'jobTitle') as HTMLInputElement).value.trim(),
  )!
  assert.equal((workdayFieldControl(blank, 'jobTitle') as HTMLInputElement).value, '')
  assert.equal((workdayFieldControl(blank, 'companyName') as HTMLInputElement).value, '')
  const blankTo = blank.querySelector('[data-automation-id="formField-endDate"]')!
  assert.equal(workdayDatePartInput(blankTo, 'month')?.value, '')
  assert.equal(workdayDatePartInput(blankTo, 'year')?.value, '')
  const fullStack = listWorkdayPanels(doc, 'experience').find(
    (group) =>
      (workdayFieldControl(group, 'jobTitle') as HTMLInputElement).value === 'Full Stack Developer',
  )!
  const fullStackTo = fullStack.querySelector('[data-automation-id="formField-endDate"]')!
  assert.equal(workdayDatePartInput(fullStackTo, 'month')?.value, '')
  assert.equal(workdayDatePartInput(fullStackTo, 'year')?.value, '')
})

test('Cisco application questions are not a miss when the closed label is the question plus the answer', async () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document
  const question = (id: string, text: string) => {
    const field = doc.createElement('div')
    field.setAttribute('data-automation-id', `formField-${id}`)
    const box = doc.createElement('fieldset')
    const legend = doc.createElement('legend')
    legend.textContent = text
    const button = doc.createElement('button')
    button.type = 'button'
    button.id = id
    button.setAttribute('aria-haspopup', 'listbox')
    button.textContent = 'Select One'
    // SelectField's accessible name is the question, the selected answer, then Required.
    button.setAttribute('aria-label', `${text} Select One Required`)
    const input = doc.createElement('input')
    input.type = 'text'
    input.id = `${id}-value`
    input.style.display = 'none'
    box.append(legend, button, input)
    field.appendChild(box)
    doc.body.appendChild(field)
    button.addEventListener('click', (event) => event.preventDefault())
    button.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key
      if (key === 'Y') {
        button.textContent = `${text} Yes Required`
        button.setAttribute('aria-label', `${text} Yes Required`)
      }
      if (key === 'N') {
        button.textContent = `${text} No Required`
        button.setAttribute('aria-label', `${text} No Required`)
      }
    })
    return { button, input }
  }
  const authorized = question(
    'authorized',
    'Are you legally authorized to work in any of the posted location for this requisition?',
  )
  const sponsorship = question(
    'sponsorship',
    'Will you now or in the future require sponsorship for an employment visa for any of the posted locations?',
  )
  const government = question(
    'government',
    'Have you ever been employed by a foreign government entity in any capacity?',
  )
  const family = question(
    'family',
    'Do you have a family relationship with a U.S. Government or Foreign Government Official?',
  )
  const yearsField = doc.createElement('div')
  yearsField.setAttribute('data-automation-id', 'formField-years')
  const yearsLegend = doc.createElement('legend')
  yearsLegend.textContent = 'How many years of relevant work experience related to this position do you have?'
  const years = doc.createElement('input')
  years.type = 'text'
  years.id = 'years'
  yearsField.append(yearsLegend, years)
  doc.body.appendChild(yearsField)
  const { workdayQuestionAutofillResult } = await import('./workday.ts')
  const profile = { workAuthorization: 'us_citizen', sponsorshipRequired: 'No' }
  const result = await workdayQuestionAutofillResult(doc.body, profile)
  assert.notEqual(result.message, 'No matching fields found')
  assert.match(authorized.button.textContent || '', /\bYes\b/)
  assert.match(sponsorship.button.textContent || '', /\bNo\b/)
  assert.equal(government.button.textContent, 'Select One')
  assert.equal(family.button.textContent, 'Select One')
  assert.equal(years.value, '')
  assert.doesNotMatch(government.button.textContent || '', /\bYes\b|\bNo\b/)
  const again = await workdayQuestionAutofillResult(doc.body, profile)
  assert.notEqual(again.message, 'No matching fields found')
  assert.equal(government.button.textContent, 'Select One')
  assert.equal(family.button.textContent, 'Select One')
  assert.equal(years.value, '')
})

const BLUE_ORIGIN_SOURCES = [
  'Career Websites',
  'College/University',
  'Event',
  'Job Sites',
  'Military/Veteran',
  'News',
  'Other',
]

function sourceLeaf(doc: Document, label: string, onCommit: (label: string) => void): HTMLElement {
  const item = doc.createElement('div')
  item.setAttribute('role', 'option')
  item.setAttribute('data-automation-id', 'menuItem')
  const leaf = doc.createElement('div')
  leaf.setAttribute('data-automation-id', 'promptLeafNode')
  leaf.setAttribute('data-automation-label', label)
  const text = doc.createElement('div')
  text.textContent = label
  text.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  leaf.appendChild(text)
  leaf.addEventListener('click', () => onCommit(label))
  item.appendChild(leaf)
  return item
}

function sourceFolder(doc: Document, label: string): HTMLElement {
  const item = doc.createElement('div')
  item.setAttribute('role', 'option')
  item.setAttribute('data-automation-id', 'promptOption')
  item.setAttribute('data-automation-label', label)
  const text = doc.createElement('div')
  text.textContent = label
  const icon = doc.createElement('svg')
  icon.setAttribute('class', 'wd-icon-chevron-right wd-icon')
  item.append(text, icon)
  return item
}

test('Blue Origin flat How Did You Hear selects Other and Chevron stays empty', async () => {
  assert.equal(workdayCompanyToken('blueorigin.wd5.myworkdayjobs.com'), 'blueorigin')
  assert.equal(workdayCompanyOwnedSourceOption(BLUE_ORIGIN_SOURCES, 'blueorigin'), 'Other')
  assert.equal(
    workdayCompanyOwnedSourceOption(
      BLUE_ORIGIN_SOURCES.filter((label) => label !== 'Other'),
      'blueorigin',
    ),
    'Career Websites',
  )
  assert.equal(
    workdayCompanyOwnedSourceOption(['Conference/Professional Organization', 'University'], 'chevron'),
    null,
  )
  assert.equal(
    workdayCompanyOwnedSourceOption(['LinkedIn', 'Cisco.com', 'Know Someone at the Company'], 'cisco'),
    'Cisco.com',
  )

  const openFlat = (url: string, labels: string[]) => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <div data-automation-id="formField-source">
          <label id="source-label">How Did You Hear About Us?</label>
          <button id="source" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="source-anchor" aria-labelledby="source-label">
            <span data-automation-id="promptSelectionLabel">Select One</span>
          </button>
        </div>
        <div id="source-anchor"></div>
      </body>`,
      { url },
    )
    const doc = dom.window.document
    const button = doc.getElementById('source') as HTMLButtonElement
    const value = button.querySelector('[data-automation-id="promptSelectionLabel"]') as HTMLElement
    const selected: string[] = []
    const paint = (parent: HTMLElement) => {
      parent.replaceChildren()
      for (const label of labels) {
        parent.appendChild(
          sourceLeaf(doc, label, (chosen) => {
            selected.push(chosen)
            value.textContent = chosen
            button.setAttribute('aria-expanded', 'false')
            doc.getElementById('source-popup')?.remove()
          }),
        )
      }
    }
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-expanded') === 'true') {
        button.setAttribute('aria-expanded', 'false')
        doc.getElementById('source-popup')?.remove()
        return
      }
      button.setAttribute('aria-expanded', 'true')
      const popup = doc.createElement('div')
      popup.id = 'source-popup'
      popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
      paint(popup)
      doc.body.appendChild(popup)
    })
    return { button, value, selected }
  }

  const { selectWorkdaySource } = await import('./workday.ts')
  const blue = openFlat('https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply', BLUE_ORIGIN_SOURCES)
  assert.equal(await selectWorkdaySource(blue.button), 'Other')
  assert.equal(blue.value.textContent, 'Other')
  assert.deepEqual(blue.selected, ['Other'])

  const websites = openFlat(
    'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply',
    BLUE_ORIGIN_SOURCES.filter((label) => label !== 'Other'),
  )
  assert.equal(await selectWorkdaySource(websites.button), 'Career Websites')
  assert.equal(websites.value.textContent, 'Career Websites')
  assert.deepEqual(websites.selected, ['Career Websites'])

  const chevron = openFlat('https://chevron.wd5.myworkdayjobs.com/en-US/external/apply', [
    'Conference/Professional Organization',
    'University',
  ])
  assert.equal(await selectWorkdaySource(chevron.button), null)
  assert.equal(chevron.value.textContent, 'Select One')
  assert.deepEqual(chevron.selected, [])
})

test('nested How Did You Hear opens parents and selects the company site', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <div data-automation-id="formField-source">
        <label id="source-label">How Did You Hear About Us?</label>
        <button id="source" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="source-label">
          <span data-automation-id="promptSelectionLabel">Select One</span>
        </button>
      </div>
    </body>`,
    { url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_university/apply' },
  )
  const doc = dom.window.document
  const button = doc.getElementById('source') as HTMLButtonElement
  const value = button.querySelector('[data-automation-id="promptSelectionLabel"]') as HTMLElement
  const selected: string[] = []
  const children: Record<string, string[]> = {
    'Adobe Source': [
      'Adobe Career Academy',
      'Know Someone at the Company',
      'Adobe.com',
      'University Research Faculty',
    ],
    'Contingent Worker-Specific': ['Contingent Worker'],
    'Job Board': ['LinkedIn', 'Indeed'],
    'Social Media': ['Instagram', 'GitHub'],
    'Through my University': ['Career Fair'],
  }
  const paintParents = (popup: HTMLElement) => {
    popup.replaceChildren()
    for (const label of Object.keys(children)) {
      const folder = sourceFolder(doc, label)
      folder.addEventListener('click', () => {
        popup.replaceChildren()
        const back = doc.createElement('button')
        back.type = 'button'
        back.setAttribute('data-automation-id', 'backButton')
        back.textContent = 'Back'
        back.addEventListener('click', () => paintParents(popup))
        popup.appendChild(back)
        for (const child of children[label]) {
          popup.appendChild(
            sourceLeaf(doc, child, (chosen) => {
              selected.push(chosen)
              value.textContent = chosen
            }),
          )
        }
      })
      popup.appendChild(folder)
    }
  }
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') {
      button.setAttribute('aria-expanded', 'false')
      doc.getElementById('source-popup')?.remove()
      return
    }
    button.setAttribute('aria-expanded', 'true')
    const popup = doc.createElement('div')
    popup.id = 'source-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    paintParents(popup)
    doc.body.appendChild(popup)
  })
  const { selectWorkdaySource } = await import('./workday.ts')
  assert.equal(await selectWorkdaySource(button), 'Adobe.com')
  assert.equal(value.textContent, 'Adobe.com')
  assert.deepEqual(selected, ['Adobe.com'])
  assert.equal(selected.includes('LinkedIn'), false)
  assert.equal(selected.includes('Career Fair'), false)
  assert.equal(selected.includes('Know Someone at the Company'), false)
  assert.equal(selected.includes('Contingent Worker'), false)
  assert.equal(selected.includes('Instagram'), false)
})

test('Autofill opens a 0 items selected How Did You Hear input and selects Other', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <div data-automation-id="formField-source">
        <label id="source-label">How Did You Hear About Us?</label>
        <input id="source" type="text" value="0 items selected" aria-labelledby="source-label" aria-controls="source-anchor" />
      </div>
      <div id="source-anchor"></div>
      <button id="closed" type="button" aria-haspopup="listbox">
        <span data-automation-id="promptSelectionLabel">0 items selected</span>
      </button>
    </body>`,
    { url: 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply' },
  )
  const doc = dom.window.document
  const input = doc.getElementById('source') as HTMLInputElement
  const closed = doc.getElementById('closed') as HTMLButtonElement
  assert.equal(workdayListboxIsEmpty(closed), true)
  const closedLabel = closed.querySelector('[data-automation-id="promptSelectionLabel"]') as HTMLElement
  closedLabel.textContent = '1 item selected'
  assert.equal(workdayListboxIsEmpty(closed), false)
  closedLabel.textContent = 'Select One'
  assert.equal(workdayListboxIsEmpty(closed), true)

  const selected: string[] = []
  input.addEventListener('click', () => {
    if (doc.getElementById('source-popup')) return
    const popup = doc.createElement('div')
    popup.id = 'source-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    for (const label of BLUE_ORIGIN_SOURCES) {
      popup.appendChild(
        sourceLeaf(doc, label, (chosen) => {
          selected.push(chosen)
          input.value = chosen
        }),
      )
    }
    doc.body.appendChild(popup)
  })
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  assert.equal(rule.includeFilled?.(input), true)
  const info = {} as PersonalInfo
  assert.equal(await rule.apply(input, 'howdidyouhearaboutus', info), true)
  assert.equal(input.value, 'Other')
  assert.deepEqual(selected, ['Other'])
  for (const forbidden of ['Career Websites', 'College/University', 'Event', 'Job Sites', 'Military/Veteran', 'News']) {
    assert.equal(selected.includes(forbidden), false)
  }
  assert.equal(rule.includeFilled?.(input), false)
})

test('Blue Origin source multiselect with a Search box and 0 items selected selects Other', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <span data-automation-id="promptIcon" id="other-icon" aria-hidden="true"></span>
      <div data-automation-id="formField-source" data-fkit-id="source--source">
        <label id="source-label">How Did You Hear About Us?</label>
        <div data-automation-id="multiSelectContainer">
          <input id="source--source" type="text" placeholder="Search" value="" aria-required="true" />
          <div data-automation-id="promptAriaInstruction" aria-hidden="true">0 items selected</div>
          <span data-automation-id="promptIcon" id="source-icon" aria-hidden="true"></span>
        </div>
      </div>
    </body>`,
    { url: 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply' },
  )
  const doc = dom.window.document
  const input = doc.getElementById('source--source') as HTMLInputElement
  const icon = doc.getElementById('source-icon') as HTMLElement
  const decoy = doc.getElementById('other-icon') as HTMLElement
  const instruction = doc.querySelector('[data-automation-id="promptAriaInstruction"]') as HTMLElement
  const selected: string[] = []
  let pointerDown = false
  let decoyPressed = false
  input.addEventListener('click', () => {
    input.dataset.clicked = 'true'
  })
  decoy.addEventListener('mousedown', () => {
    decoyPressed = true
  })
  decoy.addEventListener('click', () => {
    decoyPressed = true
  })
  // A bare click() does not open this widget. The list appears only after the
  // same mousedown, mouseup, click sequence a prompt row requires.
  icon.addEventListener('mousedown', (event) => {
    pointerDown = event.button === 0
  })
  icon.addEventListener('mouseup', (event) => {
    if (event.button !== 0) pointerDown = false
  })
  const paintCatalog = (popup: HTMLElement) => {
    popup.replaceChildren()
    for (const label of BLUE_ORIGIN_SOURCES) {
      popup.appendChild(
        sourceLeaf(doc, label, (chosen) => {
          selected.push(chosen)
          const pill = doc.createElement('div')
          pill.setAttribute('data-automation-id', 'selectedItem')
          pill.textContent = chosen
          icon.parentElement?.appendChild(pill)
          instruction.textContent = '1 item selected'
          popup.remove()
        }),
      )
    }
  }
  // Focusing the search box replaces the catalog with a typeahead. Those rows
  // stay unselected: a click does not commit Amazon Career Choice or Other.
  input.addEventListener('focus', () => {
    const popup = doc.getElementById('source-popup')
    if (!popup) return
    popup.replaceChildren()
    for (const label of ['Amazon Career Choice', 'Other']) {
      popup.appendChild(
        sourceLeaf(doc, label, () => {
          selected.push(label)
        }),
      )
    }
  })
  icon.addEventListener('click', () => {
    if (!pointerDown) return
    pointerDown = false
    if (doc.getElementById('source-popup')) return
    const popup = doc.createElement('div')
    popup.id = 'source-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    paintCatalog(popup)
    doc.body.appendChild(popup)
  })
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  assert.equal(workdayPromptFaceIsEmpty(input), true)
  assert.equal(rule.includeFilled?.(input), true)
  const info = {} as PersonalInfo
  assert.equal(await rule.apply(input, 'howdidyouhearaboutus', info), true)
  assert.equal(input.value, '')
  assert.equal(input.hasAttribute('data-clicked'), false)
  assert.equal(decoyPressed, false)
  assert.equal(doc.activeElement === input, false)
  assert.deepEqual(selected, ['Other'])
  assert.equal(selected.includes('Amazon Career Choice'), false)
  assert.equal(doc.querySelector('[data-automation-id="selectedItem"]')?.textContent, 'Other')
  for (const forbidden of ['Career Websites', 'College/University', 'Event', 'Job Sites', 'Military/Veteran', 'News']) {
    assert.equal(selected.includes(forbidden), false)
  }
  assert.equal(workdayPromptFaceIsEmpty(input), false)
})

test('Blue Origin source typeahead highlight is not an Other pill', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <div data-automation-id="formField-source" data-fkit-id="source--source">
        <label id="source-label">How Did You Hear About Us?</label>
        <div data-automation-id="multiSelectContainer">
          <input id="source--source" type="text" placeholder="Search" value="" aria-required="true" />
          <div data-automation-id="promptAriaInstruction" aria-hidden="true">0 items selected</div>
          <span data-automation-id="promptIcon" id="source-icon" aria-hidden="true"></span>
        </div>
      </div>
    </body>`,
    { url: 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply' },
  )
  const doc = dom.window.document
  const input = doc.getElementById('source--source') as HTMLInputElement
  const icon = doc.getElementById('source-icon') as HTMLElement
  const instruction = doc.querySelector('[data-automation-id="promptAriaInstruction"]') as HTMLElement
  const committed: string[] = []
  const typeaheadClicks: string[] = []
  let pointerDown = false
  let dismissedTypeahead = false
  const paintTypeahead = (popup: HTMLElement) => {
    popup.replaceChildren()
    const header = doc.createElement('div')
    header.textContent = 'Search Results'
    popup.appendChild(header)
    for (const label of ['Amazon Career Choice', 'Other']) {
      const row = sourceLeaf(doc, label, (chosen) => {
        typeaheadClicks.push(chosen)
      })
      // A highlighted search row looks chosen. It is not a selected pill.
      if (label === 'Other') row.setAttribute('aria-selected', 'true')
      popup.appendChild(row)
    }
  }
  const paintCatalog = (popup: HTMLElement) => {
    popup.replaceChildren()
    for (const label of BLUE_ORIGIN_SOURCES) {
      popup.appendChild(
        sourceLeaf(doc, label, (chosen) => {
          committed.push(chosen)
          const pill = doc.createElement('div')
          pill.setAttribute('data-automation-id', 'selectedItem')
          pill.textContent = chosen
          icon.parentElement?.appendChild(pill)
          instruction.textContent = '1 item selected'
          popup.remove()
        }),
      )
    }
  }
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (doc.getElementById('source-popup')) dismissedTypeahead = true
    doc.getElementById('source-popup')?.remove()
  })
  icon.addEventListener('mousedown', (event) => {
    pointerDown = event.button === 0
  })
  icon.addEventListener('mouseup', (event) => {
    if (event.button !== 0) pointerDown = false
  })
  // The first autofill open is the two-row search list. A later open, after
  // that list is dismissed and the box is still empty, is the catalog.
  icon.addEventListener('click', () => {
    if (!pointerDown) return
    pointerDown = false
    if (doc.getElementById('source-popup')) return
    const popup = doc.createElement('div')
    popup.id = 'source-popup'
    popup.setAttribute('data-automation-id', 'responsiveMonikerPrompt')
    if (dismissedTypeahead) paintCatalog(popup)
    else paintTypeahead(popup)
    doc.body.appendChild(popup)
  })
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  assert.equal(workdayPromptFaceIsEmpty(input), true)
  const info = {} as PersonalInfo
  assert.equal(await rule.apply(input, 'howdidyouhearaboutus', info), true)
  assert.deepEqual(typeaheadClicks, [])
  assert.deepEqual(committed, ['Other'])
  assert.equal(committed.includes('Amazon Career Choice'), false)
  assert.equal(doc.querySelector('[data-automation-id="selectedItem"]')?.textContent, 'Other')
  assert.equal(doc.getElementById('source-popup'), null)
  assert.notEqual(instruction.textContent, '0 items selected')
  assert.equal(input.value, '')
  for (const forbidden of ['Career Websites', 'College/University', 'Event', 'Job Sites', 'Military/Veteran', 'News']) {
    assert.equal(committed.includes(forbidden), false)
  }
  assert.equal(workdayPromptFaceIsEmpty(input), false)
})

test('previously been employed or worked as a contractor selects No', async () => {
  const question = 'Have you previously been employed or worked as a contractor at Blue Origin?'
  assert.equal(workdayIsFormerEmployeeQuestion(question), true)
  assert.equal(workdayIsFormerEmployeeQuestion('Have you previously been employed at Blue Origin?'), true)
  assert.equal(workdayIsFormerEmployeeQuestion('Have you worked as a contractor at Blue Origin?'), true)
  const dom = new JSDOM(
    `<!doctype html><body>
      <fieldset>
        <legend>${question}</legend>
        <input type="radio" name="blue-origin-employed" id="employed-yes" value="yes" />
        <label for="employed-yes">Yes</label>
        <input type="radio" name="blue-origin-employed" id="employed-no" value="no" />
        <label for="employed-no">No</label>
      </fieldset>
    </body>`,
    { url: 'https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/apply' },
  )
  const doc = dom.window.document
  const { default: workdayConfig } = await import('./workday.ts')
  const rule = workdayConfig()
  const yes = doc.getElementById('employed-yes') as HTMLInputElement
  const no = doc.getElementById('employed-no') as HTMLInputElement
  const info = {} as PersonalInfo
  assert.equal(await rule.apply(yes, '', info), true)
  assert.equal(yes.checked, false)
  assert.equal(await rule.apply(no, '', info), true)
  assert.equal(no.checked, true)
  assert.equal(yes.checked, false)
})
