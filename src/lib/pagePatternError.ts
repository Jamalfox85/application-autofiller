// Chrome compiles an input's pattern attribute with the `v` flag. A class such
// as `[A-Za-z0-9._%+-]` is invalid there, and checkValidity throws a SyntaxError
// that the console attributes to the caller. The same throw can come from a
// page listener on input, change, or blur.
const PAGE_PATTERN_ERROR =
  /checkValidity|reportValidity|regular expression|Invalid character in character class|pattern attribute|is not a valid regular expression/i

export function isPagePatternError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return PAGE_PATTERN_ERROR.test(message)
}

export function ignorePagePatternError(work: () => void): void {
  try {
    work()
  } catch (error) {
    if (isPagePatternError(error)) return
    throw error
  }
}
