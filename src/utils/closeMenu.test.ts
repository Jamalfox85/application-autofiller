import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body><div class="select"><input id="q" aria-expanded="true" value="Blue Bell"><button aria-label="Toggle flyout"></button></div></body>')
const w = dom.window as unknown as Record<string, unknown>
for (const k of ['window', 'document', 'KeyboardEvent', 'FocusEvent', 'MouseEvent', 'InputEvent', 'Event', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : w[k], configurable: true, writable: true })
}
const { closeReactSelectMenu } = await import('./inputHandlers.ts')
import { currentLocationQueries, pickCurrentLocationOption } from './siteRules/greenhouseFields.ts'

test('a failed react-select fill clears the query and sends Escape, blur and focusout', () => {
  const input = dom.window.document.getElementById('q') as HTMLInputElement
  const seen: string[] = []
  input.addEventListener('keydown', (e) => seen.push((e as KeyboardEvent).key))
  input.addEventListener('focusout', () => seen.push('focusout'))
  let toggled = false
  dom.window.document.querySelector('button')!.addEventListener('mouseup', () => (toggled = true))
  closeReactSelectMenu(input)
  assert.equal(input.value, '')
  assert.deepEqual(seen, ['Escape', 'focusout'])
  assert.equal(toggled, true, 'flyout toggled because the menu stayed expanded')
})

test('Current Location tries city+state, city, then the state', () => {
  const info = { city: 'Blue Bell', state: 'Pennsylvania', country: 'united_states' }
  assert.deepEqual(currentLocationQueries(info), ['Blue Bell, Pennsylvania', 'Blue Bell', 'Pennsylvania'])
})

test('a fixed list with only the state is accepted, unrelated places are not', () => {
  const info = { city: 'Blue Bell', state: 'Pennsylvania', country: 'united_states' }
  assert.equal(pickCurrentLocationOption(['Texas', 'Pennsylvania', 'Ohio'], info), 'Pennsylvania')
  assert.equal(pickCurrentLocationOption(['Texas', 'Ohio'], info), null)
  assert.equal(pickCurrentLocationOption(['Blue Bell, PA, USA'], info), 'Blue Bell, PA, USA')
})
