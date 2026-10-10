import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const BG = '#121216'
test('upload tab text colors meet WCAG AA (4.5:1) on the tab background', () => {
  const src = readFileSync(new URL('./ResumeUploadTab.vue', import.meta.url), 'utf8')
  assert.ok(src.includes(`background: ${BG}`), 'tab sets its own dark background')
  for (const fg of ['#ebebee', '#c4c4cc', '#86efac', '#fca5a5']) {
    assert.ok(src.includes(fg), `${fg} used`)
    assert.ok(ratio(fg, BG) >= 4.5, `${fg} on ${BG} = ${ratio(fg, BG).toFixed(2)}`)
  }
  assert.ok(ratio('#ffffff', '#6d28d9') >= 4.5, 'button label contrast')
})
