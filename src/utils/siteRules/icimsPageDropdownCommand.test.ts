import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import {
  deliverIcimsPageDropdown,
  icimsPageDropdownCommand,
  sanitizeIcimsPageDropdownRequest,
} from './icimsPageDropdownCommand.js'
import { chromeIcimsPageDropdownBridge } from './icimsFields.ts'

function runInPage(request: unknown, registry: Record<string, unknown>) {
  const clicks: string[] = []
  const sandbox = vm.createContext({
    setTimeout,
    clearTimeout,
    ICIMS: { dropdowns: registry },
    document: {
      querySelector() {
        clicks.push('query')
        return { click() { clicks.push('click') } }
      },
    },
    clicks,
  })
  const command = `(${icimsPageDropdownCommand.toString()})`
  const result = vm.runInContext(`${command}(${JSON.stringify(request)})`, sandbox)
  return Promise.resolve(result).then((value) => ({
    value: JSON.parse(JSON.stringify(value)) as unknown,
    clicks: sandbox.clicks as string[],
  }))
}

test('page dropdown command reads, searches, and commits without clicking', async () => {
  const calls: string[] = []
  const widget = {
    query: '',
    words: [] as Array<{ value: string; text: string | { en_US: string } }>,
    setInput(value: string) {
      widget.query = value
      calls.push('set:' + value)
    },
    resetOptions(callback?: () => void) {
      calls.push('reset')
      widget.words = [
        { value: 'D41234', text: { en_US: 'United States Minor Outlying Islands' } },
        { value: 'D41001', text: 'United States' },
      ]
      callback?.()
    },
    getWords() {
      return widget.words
    },
    findWordFromValue(value: string) {
      return widget.words.find((word) => word.value === value) ?? null
    },
    optionSelected(word: { value: string; text: string }) {
      calls.push('commit:' + word.value + ':' + word.text)
      throw new Error('list.onchange is not a function')
    },
  }

  const missing = await runInPage({ op: 'read', id: 'PersonProfileFields.AddressCountry' }, {})
  assert.deepEqual(missing.value, { ok: false })
  assert.deepEqual(missing.clicks, [])

  const read = await runInPage({ op: 'read', id: 'PersonProfileFields.AddressCountry' }, {
    'PersonProfileFields.AddressCountry': widget,
  })
  assert.deepEqual(read.value, { ok: true, words: [] })

  const searched = await runInPage(
    { op: 'search', id: 'PersonProfileFields.AddressCountry', query: 'United States' },
    { 'PersonProfileFields.AddressCountry': widget },
  )
  assert.deepEqual(searched.value, {
    ok: true,
    words: [
      { value: 'D41234', text: 'United States Minor Outlying Islands' },
      { value: 'D41001', text: 'United States' },
    ],
  })
  assert.deepEqual(calls, ['set:United States', 'reset'])
  assert.deepEqual(searched.clicks, [])

  const committed = await runInPage(
    {
      op: 'commit',
      id: 'PersonProfileFields.AddressCountry',
      value: 'D41001',
      label: 'United States',
    },
    { 'PersonProfileFields.AddressCountry': widget },
  )
  assert.deepEqual(committed.value, { ok: true, committed: true })
  assert.deepEqual(calls, ['set:United States', 'reset', 'commit:D41001:United States'])
  assert.deepEqual(committed.clicks, [])
  assert.equal(icimsPageDropdownCommand.toString().includes('.click'), false)
  assert.equal(icimsPageDropdownCommand.toString().includes('hcaptcha'), false)
  assert.equal(icimsPageDropdownCommand.toString().includes('querySelector'), false)
})

test('page dropdown delivery targets the sender frame in the page world', async () => {
  assert.equal(sanitizeIcimsPageDropdownRequest({ op: 'click', id: 'PersonProfileFields.AddressCountry' }), null)
  assert.equal(sanitizeIcimsPageDropdownRequest({ op: 'commit', id: '__proto__' }), null)
  const kept = sanitizeIcimsPageDropdownRequest({
    op: 'search',
    id: 'PersonProfileFields.AddressState',
    query: 'New Jersey',
  })
  assert.deepEqual(kept, { op: 'search', id: 'PersonProfileFields.AddressState', query: 'New Jersey' })

  let injected: Record<string, unknown> | null = null
  const result = await deliverIcimsPageDropdown(
    { op: 'read', id: 'PersonProfileFields.AddressCountry', extra: 'nope' },
    { tab: { id: 7 }, frameId: 3 },
    {
      async executeScript(details: Record<string, unknown>) {
        injected = details
        return [{ result: { ok: true, words: [{ value: 'D41001', text: 'United States' }] } }]
      },
    },
  )
  assert.deepEqual(result, { ok: true, words: [{ value: 'D41001', text: 'United States' }] })
  assert.equal(injected?.world, 'MAIN')
  assert.equal(injected?.func, icimsPageDropdownCommand)
  assert.deepEqual(injected?.target, { tabId: 7, frameIds: [3] })
  assert.deepEqual(injected?.args, [{ op: 'read', id: 'PersonProfileFields.AddressCountry' }])

  const missingTab = await deliverIcimsPageDropdown({ op: 'read', id: 'PersonProfileFields.AddressCountry' }, {}, {
    async executeScript() {
      throw new Error('should not inject')
    },
  })
  assert.deepEqual(missingTab, { ok: false })

  const failed = await deliverIcimsPageDropdown(
    { op: 'read', id: 'PersonProfileFields.AddressCountry' },
    { tab: { id: 1 }, frameId: 0 },
    {
      async executeScript() {
        throw new Error('cannot access frame')
      },
    },
  )
  assert.deepEqual(failed, { ok: false })
})

test('content script asks the service worker to run the page dropdown command', async () => {
  const host = globalThis as { chrome?: { runtime?: { sendMessage?: (message: unknown) => unknown } } }
  const previous = host.chrome
  const seen: unknown[] = []
  host.chrome = {
    runtime: {
      sendMessage(message: unknown) {
        seen.push(message)
        return { ok: true, words: [{ value: 'D41001', text: 'United States' }] }
      },
    },
  }
  try {
    const result = await chromeIcimsPageDropdownBridge({
      op: 'read',
      id: 'PersonProfileFields.AddressCountry',
    })
    assert.deepEqual(seen, [
      {
        action: 'icimsPageDropdown',
        request: { op: 'read', id: 'PersonProfileFields.AddressCountry' },
      },
    ])
    assert.deepEqual(result, { ok: true, words: [{ value: 'D41001', text: 'United States' }] })
    host.chrome = {
      runtime: {
        sendMessage() {
          throw new Error('worker asleep')
        },
      },
    }
    assert.deepEqual(
      await chromeIcimsPageDropdownBridge({ op: 'read', id: 'PersonProfileFields.AddressCountry' }),
      { ok: false },
    )
  } finally {
    if (previous === undefined) delete host.chrome
    else host.chrome = previous
  }
})

test('service worker wires the iCIMS page dropdown command', () => {
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  assert.equal(background.includes("request.action === 'icimsPageDropdown'"), true)
  assert.equal(background.includes('deliverIcimsPageDropdown'), true)
  assert.equal(background.includes('./src/utils/siteRules/icimsPageDropdownCommand.js'), true)
  assert.equal(emit.includes('src/utils/siteRules/icimsPageDropdownCommand.js'), true)
  const fields = readFileSync(new URL('./icimsFields.ts', import.meta.url), 'utf8')
  assert.equal(fields.includes("action: 'icimsPageDropdown'"), true)
  assert.equal(fields.includes('chromeIcimsPageDropdownBridge'), true)
})
