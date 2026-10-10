// A site rule can return true for a field it owns and still write nothing. Quota and the
// success toast only count a field whose value, check state, file list, or visible
// combobox label actually changed.

export interface FieldSnapshot {
  prevValue: string
  prevChecked?: boolean
  prevContext?: string
  prevFiles?: number
}

export interface WritableField {
  value: string
  type?: string
  checked?: boolean
  files?: { length: number } | null
  classList?: { contains: (token: string) => boolean }
  getAttribute?: (name: string) => string | null
  closest?: (selector: string) => { textContent?: string | null; parentElement?: { textContent?: string | null } | null } | null
  parentElement?: { textContent?: string | null } | null
}

// react-select and Greenhouse comboboxes keep input.value empty and render the
// choice in a sibling (.select__single-value). Read that widget, not a distant
// ancestor: a class match on "select-none" used to treat any form text change
// as a fill.
export function fieldContextText(input: WritableField): string {
  const widget = input.closest?.(
    '.select, [class*="select__control"], [class*="select__container"], [class*="select__value"]',
  )
  const box =
    widget ??
    (input.getAttribute?.('role') === 'combobox' || input.classList?.contains('select__input')
      ? input.parentElement
      : null)
  return (box?.textContent || '').trim()
}

export function captureFieldSnapshot(input: WritableField): FieldSnapshot {
  const prevContext = fieldContextText(input)
  const prevFiles = input.type === 'file' ? input.files?.length ?? 0 : undefined
  if (input.type === 'checkbox' || input.type === 'radio') {
    return { prevValue: input.value, prevChecked: !!input.checked, prevContext, prevFiles }
  }
  return { prevValue: input.value, prevContext, prevFiles }
}

export function fieldWasWritten(input: WritableField, snapshot: FieldSnapshot): boolean {
  if (input.type === 'file') {
    return (input.files?.length ?? 0) !== (snapshot.prevFiles ?? 0)
  }
  if (input.type === 'checkbox' || input.type === 'radio') {
    return !!input.checked !== !!snapshot.prevChecked
  }
  if (input.value !== snapshot.prevValue) return true
  // Plain inputs expose the answer on .value. Comparing the whole parent text
  // counted a fill when a sibling counter or validation message changed.
  const context = fieldContextText(input)
  if (!context && !(snapshot.prevContext ?? '')) return false
  if (!usesWidgetLabel(input)) return false
  return context !== (snapshot.prevContext ?? '')
}

function usesWidgetLabel(input: WritableField): boolean {
  if (input.getAttribute?.('role') === 'combobox') return true
  if (input.classList?.contains('select__input')) return true
  return !!input.closest?.(
    '.select, [class*="select__control"], [class*="select__container"], [class*="select__value"]',
  )
}
