// "Require confirmation before filling" / "Ask before entering this password".
// Workday and iCIMS both call this. A copied check in one portal is how the
// flag was ignored on Workday while iCIMS grew its own reader.

export function savedAccountRequiresConfirmation(
  account: { requireConfirmation?: boolean } | null | undefined,
): boolean {
  return account?.requireConfirmation === true
}

let confirmed = false
let promptOpen = false
let generation = 0

type Presenter = (onConfirm: () => void, onDismiss: () => void) => void

let presenter: Presenter | null = null

export function isSavedPasswordFillConfirmed(): boolean {
  return confirmed
}

export function confirmSavedPasswordFill(): void {
  confirmed = true
  promptOpen = false
}

export function resetSavedPasswordFillConfirmation(): void {
  generation += 1
  confirmed = false
  promptOpen = false
}

export function setSavedPasswordPromptPresenter(next: Presenter | null): void {
  presenter = next
}

// True when this saved password must stay blank until the user confirms.
// `confirmed` overrides the page session so a test can pin the decision
// without racing another file that is mid-prompt.
export function savedPasswordAwaitingConfirmation(
  account: { requireConfirmation?: boolean; password?: string | null } | null | undefined,
  options?: { confirmed?: boolean },
): boolean {
  if (!savedAccountRequiresConfirmation(account)) return false
  if (!String(account?.password ?? '').trim()) return false
  const already = options?.confirmed ?? confirmed
  return !already
}

// One prompt per page until the user answers. Confirm types the password.
// Dismiss leaves it blank so the next Auto-fill or shortcut can ask again.
export function requestSavedPasswordConfirmation(onConfirm: () => void): void {
  if (confirmed) {
    onConfirm()
    return
  }
  if (promptOpen) return
  if (!presenter) return
  promptOpen = true
  const gen = generation
  presenter(
    () => {
      if (gen !== generation) return
      confirmed = true
      promptOpen = false
      onConfirm()
    },
    () => {
      if (gen !== generation) return
      promptOpen = false
    },
  )
}
