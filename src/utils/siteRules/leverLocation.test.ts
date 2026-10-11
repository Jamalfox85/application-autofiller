import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { setReactInputValue } from '../inputHandlers.ts'
import leverConfig, { beginLeverFill, setLeverLocationSearchForTests } from './lever.ts'

const HTML = readFileSync(new URL('../../../fixtures/pages/lever-location.html', import.meta.url), 'utf8')

const BLUE_BELL = [
  { name: 'Blue Bell, PA, USA', id: '5742fcc76bd5ee679f315015f769d36b9b4625e2' },
  {
    name: 'Blue Bell, Township of Northampton, PA, USA',
    id: '7d27284308e6f076dccd39f882bf08694a3d596f',
  },
]

const SELECTED = '{"name":"Blue Bell, PA, USA","id":"5742fcc76bd5ee679f315015f769d36b9b4625e2"}'

const profile = {
  city: 'Blue Bell',
  state: 'Pennsylvania',
  country: 'united_states',
  github: 'http://github.com/ada',
  linkedin: 'http://www.linkedin.com/in/ada',
  website: 'http://portfolio.example/ada',
}

type DomWindow = Window & typeof globalThis

function locationDom(url = 'https://jobs.example/apply') {
  const dom = new JSDOM(HTML, { url, runScripts: 'dangerously' })
  const view = dom.window as unknown as DomWindow
  return { dom, view, doc: view.document }
}

function adoptDom(view: DomWindow) {
  const keys = [
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'KeyboardEvent',
    'MouseEvent',
    'Event',
    'InputEvent',
  ] as const
  const previous: Record<string, unknown> = {}
  const target = globalThis as unknown as Record<string, unknown>
  const source = view as unknown as Record<string, unknown>
  for (const key of keys) {
    previous[key] = target[key]
    target[key] = source[key]
  }
  return () => {
    for (const key of keys) target[key] = previous[key]
  }
}

function menuShown(menu: HTMLElement, view: DomWindow): boolean {
  const inline = menu.style.display
  if (inline) return inline !== 'none'
  const computed = view.getComputedStyle(menu).display
  return computed !== 'none' && computed !== ''
}

// Mirrors the hosted widget: input opens the menu, and blur while it is shown
// wipes the visible field and the hidden selectedLocation value.
function installBlurReset(doc: Document) {
  const input = doc.getElementById('location-input') as HTMLInputElement
  const menu = doc.querySelector('.dropdown-container') as HTMLElement
  const hidden = doc.getElementById('selected-location') as HTMLInputElement
  const view = doc.defaultView as DomWindow
  input.addEventListener('input', () => {
    menu.style.display = 'flex'
  })
  input.addEventListener('blur', () => {
    if (!menuShown(menu, view)) return
    menu.style.display = 'none'
    input.value = ''
    hidden.value = ''
  })
  return { input, menu, hidden, view }
}

function installSuggestionRows(doc: Document, hits: typeof BLUE_BELL) {
  const input = doc.getElementById('location-input') as HTMLInputElement
  const results = doc.querySelector('.dropdown-results') as HTMLElement
  const menu = doc.querySelector('.dropdown-container') as HTMLElement
  const hidden = doc.getElementById('selected-location') as HTMLInputElement
  const clicks = { count: 0 }
  input.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Enter') {
      return
    }
    results.replaceChildren()
    hits.forEach((hit, index) => {
      const row = doc.createElement('div')
      row.className = 'dropdown-location'
      row.id = `location-${index}`
      row.textContent = hit.name
      results.appendChild(row)
    })
  })
  doc.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement | null
    if (!target?.classList?.contains('dropdown-location')) return
    clicks.count += 1
    const index = Number(target.id.split('-')[1])
    menu.style.display = 'none'
    input.value = target.textContent || ''
    hidden.value = JSON.stringify(hits[index])
    results.replaceChildren()
  })
  return clicks
}

describe('hosted location autocomplete', { concurrency: 1 }, () => {
  afterEach(() => {
    setLeverLocationSearchForTests(null)
  })

  it('clears the typed city when the menu is still open on blur', () => {
    const { doc } = locationDom()
    const { input, hidden } = installBlurReset(doc)
    input.focus()
    setReactInputValue(input, 'Blue Bell, Pennsylvania')
    assert.equal(input.value, 'Blue Bell, Pennsylvania')
    input.blur()
    assert.equal(input.value, '')
    assert.equal(hidden.value, '')
  })

  it('keeps the chosen place and its id after blur when no row was painted', async () => {
    const { view, doc } = locationDom()
    const restore = adoptDom(view)
    const { input, hidden } = installBlurReset(doc)
    setLeverLocationSearchForTests(async () => BLUE_BELL)
    beginLeverFill()
    try {
      const wrote = await leverConfig().apply(input, '', profile)
      assert.equal(wrote, true)
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
      input.focus()
      input.blur()
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
    } finally {
      restore()
    }
  })

  it('selects a painted suggestion with mousedown and keeps the page payload', async () => {
    const { view, doc } = locationDom()
    const restore = adoptDom(view)
    const { input, hidden } = installBlurReset(doc)
    const clicks = installSuggestionRows(doc, BLUE_BELL)
    setLeverLocationSearchForTests(async () => BLUE_BELL)
    beginLeverFill()
    try {
      const wrote = await leverConfig().apply(input, '', profile)
      assert.equal(wrote, true)
      assert.equal(clicks.count, 1)
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
      input.focus()
      input.blur()
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
    } finally {
      restore()
    }
  })

  it('asks the page for location rows and stores the id from that response', async () => {
    const { view, doc } = locationDom('https://jobs.example/acme/role/apply')
    const restore = adoptDom(view)
    const { input, hidden } = installBlurReset(doc)
    const calls: string[] = []
    view.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push(url)
      return new Response(JSON.stringify(BLUE_BELL), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    beginLeverFill()
    try {
      const wrote = await leverConfig().apply(input, '', profile)
      assert.equal(wrote, true)
      assert.equal(calls.length, 1)
      assert.match(calls[0], /\/searchLocations\?text=Blue%20Bell%2C%20Pennsylvania/)
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
      input.focus()
      input.blur()
      assert.equal(input.value, 'Blue Bell, PA, USA')
      assert.equal(hidden.value, SELECTED)
    } finally {
      restore()
    }
  })

  it('skips the field when no place can be chosen, so a later blur cannot wipe a typed city', async () => {
    const { view, doc } = locationDom()
    const restore = adoptDom(view)
    const { input, hidden } = installBlurReset(doc)
    setLeverLocationSearchForTests(async () => [])
    beginLeverFill()
    try {
      const wrote = await leverConfig().apply(input, '', { city: 'Blue Bell' })
      assert.equal(wrote, 'skip')
      assert.equal(input.value, '')
      assert.equal(hidden.value, '')
    } finally {
      restore()
    }
  })

  it('still types city and state into a location field that has no suggestion menu', async () => {
    const { view, doc } = locationDom()
    const restore = adoptDom(view)
    const input = doc.getElementById('plain-location') as HTMLInputElement
    beginLeverFill()
    try {
      const wrote = await leverConfig().apply(input, '', profile)
      assert.equal(wrote, true)
      assert.equal(input.value, 'Blue Bell, Pennsylvania')
    } finally {
      restore()
    }
  })

  it('fills each link field from its own profile value', async () => {
    const { view, doc } = locationDom()
    const restore = adoptDom(view)
    const github = doc.getElementById('github') as HTMLInputElement
    const linkedin = doc.getElementById('linkedin') as HTMLInputElement
    const portfolio = doc.getElementById('portfolio') as HTMLInputElement
    const other = doc.getElementById('other-website') as HTMLInputElement
    beginLeverFill()
    try {
      assert.equal(await leverConfig().apply(github, '', profile), true)
      assert.equal(github.value, 'https://github.com/ada')
      assert.equal(await leverConfig().apply(linkedin, '', profile), true)
      assert.equal(linkedin.value, 'https://www.linkedin.com/in/ada')
      assert.equal(await leverConfig().apply(portfolio, '', profile), true)
      assert.equal(portfolio.value, 'http://portfolio.example/ada')
      assert.equal(await leverConfig().apply(other, '', profile), true)
      assert.equal(other.value, '')
    } finally {
      restore()
    }
  })
})
