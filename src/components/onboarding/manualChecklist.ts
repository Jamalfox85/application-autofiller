// Pure "what opens next" decisions for the manual-entry checklist.
// Fullscreen sheets take 0.2s to leave. Opening the next one in the same tick
// stacks a second sheet on top of the one that is still fading out.
export const SHEET_LEAVE_MS = 220

export type ChecklistSection = {
  key: string
  required: boolean
}

// The next required section that is not done, starting at `afterKey` (exclusive).
// `afterKey === null` starts at the first section. Optional rows are never the target:
// Continue and Save-and-next must not walk empty optional sections.
export function nextChecklistTarget<T extends ChecklistSection>(
  sections: readonly T[],
  isDone: (section: T) => boolean,
  afterKey: string | null,
): T | null {
  const index = afterKey == null ? -1 : sections.findIndex((section) => section.key === afterKey)
  const start = index < 0 ? 0 : index + 1
  for (let i = start; i < sections.length; i++) {
    const section = sections[i]
    if (section.required && !isDone(section)) return section
  }
  return null
}

// Saving an optional section that is still empty closes the sheet and opens nothing.
// Saving a required section, or an optional one the user actually filled, opens the
// next incomplete required section after it.
export function sheetToOpenAfterSave<T extends ChecklistSection>(
  sections: readonly T[],
  isDone: (section: T) => boolean,
  savedKey: string,
): T | null {
  const saved = sections.find((section) => section.key === savedKey)
  if (saved && !saved.required && !isDone(saved)) return null
  return nextChecklistTarget(sections, isDone, savedKey)
}
