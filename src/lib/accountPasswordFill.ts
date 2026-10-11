// A sealed password that cannot be opened must not be typed and must not be
// counted as a filled field. The status line is fixed so the ciphertext and the
// plaintext never land in the log.

const LOCKED_PASSWORDS = Symbol('gofillr.lockedPasswords')

interface LockedPasswordMark {
  /** Legacy accountPassword was sealed and did not open. */
  legacy: boolean
  /** applicationAccounts ids whose passwords were sealed and did not open. */
  accountIds: readonly string[]
}

export const SAVED_ACCOUNT_PASSWORD_SKIPPED = 'Saved account password skipped'

let noted = false

export function resetSkippedAccountPasswordNote(): void {
  noted = false
}

export function noteSkippedAccountPassword(): void {
  if (noted) return
  noted = true
  console.info(SAVED_ACCOUNT_PASSWORD_SKIPPED)
}

export function markLockedPasswords<T>(info: T, legacy: boolean, accountIds: readonly string[] = []): T {
  if (!info || typeof info !== 'object') return info
  try {
    Object.defineProperty(info, LOCKED_PASSWORDS, {
      value: { legacy, accountIds: accountIds.map((id) => String(id)) } satisfies LockedPasswordMark,
      enumerable: false,
    })
  } catch {
    // A frozen copy still has blank password fields, so ciphertext is not typed.
  }
  return info
}

function lockedMark(info: unknown): LockedPasswordMark | null {
  if (!info || typeof info !== 'object') return null
  const mark = (info as { [LOCKED_PASSWORDS]?: LockedPasswordMark })[LOCKED_PASSWORDS]
  if (!mark || typeof mark !== 'object') return null
  return mark
}

/** True when this open blanked at least one sealed password. */
export function accountPasswordsUndecryptable(info: unknown): boolean {
  return lockedMark(info) != null
}

/** True when the legacy accountPassword field was sealed and did not open. */
export function legacyAccountPasswordLocked(info: unknown): boolean {
  return lockedMark(info)?.legacy === true
}

/** True when that application-account row's password was sealed and did not open. */
export function accountIdPasswordLocked(info: unknown, accountId: string | number | null | undefined): boolean {
  if (accountId == null) return false
  return lockedMark(info)?.accountIds.includes(String(accountId)) === true
}

export function isGenericAccountPasswordField(input: {
  type?: string
  name?: string
  id?: string
  autocomplete?: string
}): boolean {
  const type = (input.type || '').toLowerCase()
  if (type === 'password') return true
  const auto = (input.autocomplete || '').toLowerCase()
  if (auto.includes('password')) return true
  return `${input.name || ''} ${input.id || ''}`.toLowerCase().includes('password')
}
