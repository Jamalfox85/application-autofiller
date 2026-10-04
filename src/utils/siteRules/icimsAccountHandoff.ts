// Account-creation handoff for the iCIMS email step. Distinct from the missing
// Application Accounts notice (toast, badge, and Application Accounts sheet).
// This popup is shown even when an iCIMS login is already saved: GoFillr cannot
// finish the captcha, so the person creates the account on the site.

export const ICIMS_ACCOUNT_HANDOFF_POPUP_CLASS = 'gofillr-icims-account-handoff'

export const ICIMS_ACCOUNT_HANDOFF_TITLE = 'Create your iCIMS account on this site'

export const ICIMS_ACCOUNT_HANDOFF_MESSAGE =
  'Enter your email, complete the captcha, and choose a password on this page. GoFillr does not click Next, Log In, Create Account, Submit, or the captcha. After the account exists, GoFillr can fill the application.'

export const ICIMS_ACCOUNT_HANDOFF_DISMISS = 'OK'

type PopupRoot = {
  querySelector?: (selector: string) => { remove?: () => void } | null
  createElement?: (tag: string) => PopupElement
  body?: { appendChild?: (node: PopupElement) => void } | null
}

type PopupElement = {
  className: string
  setAttribute: (name: string, value: string) => void
  style: { cssText: string }
  append: (...nodes: PopupElement[]) => void
  textContent: string
  type?: string
  addEventListener: (type: string, listener: (event: PopupEvent) => void) => void
  remove: () => void
}

type PopupEvent = {
  preventDefault?: () => void
  stopPropagation?: () => void
}

type HandoffTransport = {
  showPopup?: () => void
  dismissPopup?: () => void
}

let transport: HandoffTransport = {}
let published = false

export function configureIcimsAccountHandoff(next: HandoffTransport) {
  transport = next
}

export function resetIcimsAccountHandoffState() {
  published = false
  transport = {}
}

function defaultDocument(): PopupRoot | null {
  try {
    if (typeof document === 'undefined') return null
    return document as unknown as PopupRoot
  } catch {
    return null
  }
}

function element(doc: PopupRoot, tag: string, cssText: string): PopupElement | null {
  const node = doc.createElement?.(tag)
  if (!node) return null
  node.style.cssText = cssText
  return node
}

// Corner card, not a full-screen overlay, so the email field and the captcha
// puzzle stay usable. Nothing in this tree is a page Next / Log In / Submit control.
export function mountIcimsAccountCreationPopup(doc: PopupRoot | null | undefined): boolean {
  if (!doc?.querySelector || !doc.createElement || !doc.body?.appendChild) return false
  if (doc.querySelector(`.${ICIMS_ACCOUNT_HANDOFF_POPUP_CLASS}`)) return false

  const card = element(
    doc,
    'div',
    `
      position: fixed;
      left: 24px;
      bottom: 24px;
      z-index: 2147483647;
      width: min(340px, calc(100vw - 32px));
      background: #16161a;
      color: #ebebee;
      border: 1px solid #2e2e36;
      border-radius: 12px;
      box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.55);
      padding: 14px 14px 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: auto;
    `,
  )
  if (!card) return false
  card.className = ICIMS_ACCOUNT_HANDOFF_POPUP_CLASS
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'false')
  card.setAttribute('aria-labelledby', 'gofillr-icims-handoff-title')

  const kicker = element(doc, 'div', 'font-size: 11px; font-weight: 650; letter-spacing: 0.02em; color: #c4b5fd;')
  const title = element(
    doc,
    'div',
    'margin-top: 4px; font-size: 15px; font-weight: 650; letter-spacing: -0.01em;',
  )
  const body = element(doc, 'p', 'margin: 8px 0 12px; font-size: 12.5px; line-height: 1.45; color: #b9b9c2;')
  const dismiss = element(
    doc,
    'button',
    `
      border: none;
      border-radius: 8px;
      background: #7c3aed;
      color: #fff;
      font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 8px 12px;
      cursor: pointer;
    `,
  )
  if (!kicker || !title || !body || !dismiss) return false

  kicker.textContent = 'GoFillr'
  title.setAttribute('id', 'gofillr-icims-handoff-title')
  title.textContent = ICIMS_ACCOUNT_HANDOFF_TITLE
  body.textContent = ICIMS_ACCOUNT_HANDOFF_MESSAGE
  dismiss.type = 'button'
  dismiss.textContent = ICIMS_ACCOUNT_HANDOFF_DISMISS
  dismiss.addEventListener('click', (event) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    card.remove()
  })

  card.append(kicker, title, body, dismiss)
  doc.body.appendChild(card)
  return true
}

export function dismissIcimsAccountCreationPopup(doc?: PopupRoot | null): void {
  if (transport.dismissPopup) {
    try {
      transport.dismissPopup()
    } catch (error) {
      console.error('iCIMS account creation popup dismiss failed', error)
    }
    return
  }
  const root = doc === undefined ? defaultDocument() : doc
  const existing = root?.querySelector?.(`.${ICIMS_ACCOUNT_HANDOFF_POPUP_CLASS}`)
  existing?.remove?.()
}

export function publishIcimsAccountCreationHandoff(): boolean {
  if (published) return false
  let shown = false
  try {
    if (transport.showPopup) {
      transport.showPopup()
      shown = true
    } else {
      shown = mountIcimsAccountCreationPopup(defaultDocument())
    }
  } catch (error) {
    console.error('iCIMS account creation popup failed', error)
    shown = false
  }
  if (!shown) return false
  published = true
  console.info(ICIMS_ACCOUNT_HANDOFF_MESSAGE)
  return true
}
