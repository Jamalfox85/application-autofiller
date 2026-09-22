// Picks the best visible dropdown option for a search string.
// Exact match wins, then the shortest option that starts with the query, then the
// shortest option that contains it. A long free-text query (a degree or school name)
// can also match a shorter option when most of that option's text is contained in
// the query — "Bachelor of Science" → "Bachelor's Degree" still needs an alias,
// but "Computer Science and Engineering" can land on "Computer Science".
export function bestOptionIndex(optionTexts: string[], query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return -1

  const norm = optionTexts.map((text) => (text || '').toLowerCase().trim())

  const exact = norm.findIndex((text) => text === q)
  if (exact >= 0) return exact

  const starts = norm
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.startsWith(q))
  if (starts.length > 0) {
    starts.sort((a, b) => a.text.length - b.text.length)
    return starts[0].index
  }

  // Single characters partial-match almost everything ("a" ⊂ "Canada").
  if (q.length < 2) return -1

  const includes = norm
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.includes(q))
  if (includes.length > 0) {
    includes.sort((a, b) => a.text.length - b.text.length)
    return includes[0].index
  }

  const reverse = norm
    .map((text, index) => ({ text, index }))
    .filter(
      (entry) =>
        entry.text.length >= 4 && entry.text.length >= q.length * 0.4 && q.includes(entry.text),
    )
  if (reverse.length > 0) {
    reverse.sort((a, b) => b.text.length - a.text.length)
    return reverse[0].index
  }

  return -1
}
