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
  workdayAccountAgreementCheckbox,
  workdayAccountInputs,
  workdayCreateAccountLink,
  workdayFieldControl,
  workdayJobApplyButton,
  workdaySignInWithEmailButton,
  listWorkdayPanels,
  matchingOptionText,
  nextWorkdayFormSignature,
  workdayAccountSubmitControl,
  workdayContactKey,
  workdayDatePartInput,
  workdayDisabilityOptionIndex,
  workdayExperienceLocation,
  workdayIsCustomSourceField,
  workdayPhoneTypeOption,
  workdaySectionKindFromLabel,
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

test('custom source fields are recognized and left for the user', () => {
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
  assert.equal(
    matchingOptionText(['United States of America', 'Canada'], 'United States', 'country'),
    'United States of America',
  )
  assert.equal(workdayPhoneTypeOption(['Work', 'Home', 'Mobile']), 'Mobile')
  assert.equal(workdayPhoneTypeOption(['Landline', 'Cell Phone']), 'Cell Phone')
  assert.equal(workdayPhoneTypeOption(['Work', 'Fax']), null)
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
