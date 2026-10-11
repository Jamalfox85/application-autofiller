import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { JSDOM } from 'jsdom'

function installDom(dom: JSDOM) {
  const win = dom.window as unknown as typeof globalThis & Window
  const assign = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  assign('window', win)
  assign('document', win.document)
  assign('HTMLElement', win.HTMLElement)
  assign('HTMLInputElement', win.HTMLInputElement)
  assign('HTMLTextAreaElement', win.HTMLTextAreaElement)
  assign('HTMLSelectElement', win.HTMLSelectElement)
  assign('Element', win.Element)
  assign('Node', win.Node)
  assign('Event', win.Event)
  assign('InputEvent', win.InputEvent)
  assign('MouseEvent', win.MouseEvent)
  assign('KeyboardEvent', win.KeyboardEvent)
  assign('FocusEvent', win.FocusEvent)
  assign('getComputedStyle', win.getComputedStyle.bind(win))
}

const profile = {
  country: 'united_states',
  phoneCountryCode: '+1',
  phone: '5551234567',
  workAuthorization: 'us_citizen',
  sponsorshipRequired: 'No',
}

describe('greenhouse repeat fill', { concurrency: false }, () => {
test(
  'a repeat Greenhouse fill leaves settled country, phone, and work authorization alone',
  { timeout: 3_000 },
  async () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <input id="phone" type="tel" value="5551234567" />
        <div class="select">
          <div class="select__single-value">United States +1</div>
          <input id="country" class="select__input" role="combobox" aria-expanded="true" value="" />
          <button aria-label="Toggle flyout"></button>
        </div>
        <div class="select">
          <div class="select__single-value">United States</div>
          <input id="question_10" class="select__input" role="combobox" aria-expanded="false" value="" />
        </div>
        <div class="select">
          <div class="select__single-value">I am authorized to work in the United States for any employer</div>
          <input id="question_11" class="select__input" role="combobox" aria-expanded="false" value="" />
        </div>
        <div class="select">
          <div class="select__single-value">No</div>
          <input id="question_12" class="select__input" role="combobox" aria-expanded="true" value="" />
          <button aria-label="Toggle flyout"></button>
        </div>
      </body>`,
      { url: 'https://job-boards.greenhouse.io/attain/jobs/1' },
    )
    installDom(dom)
    const doc = dom.window.document
    const keys: string[] = []
    for (const id of ['country', 'question_12']) {
      doc.getElementById(id)!.addEventListener('keydown', (event) => {
        keys.push(`${id}:${(event as KeyboardEvent).key}`)
      })
    }

    const { default: greenhouseConfig } = await import('../src/utils/siteRules/greenhouse.ts')
    const rule = greenhouseConfig()
    const started = Date.now()
    assert.equal(await rule.apply(doc.getElementById('country') as HTMLInputElement, '', profile), true)
    assert.equal(
      await rule.apply(doc.getElementById('question_10') as HTMLInputElement, 'countryofresidence', profile),
      true,
    )
    assert.equal(
      await rule.apply(
        doc.getElementById('question_11') as HTMLInputElement,
        'legallyauthorizedtoworkintheunitedstates',
        profile,
      ),
      true,
    )
    assert.equal(
      await rule.apply(doc.getElementById('question_12') as HTMLInputElement, 'sponsorship', profile),
      true,
    )
    assert.ok(Date.now() - started < 1_000, 'settled comboboxes must not wait on the menu')

    assert.equal((doc.getElementById('phone') as HTMLInputElement).value, '5551234567')
    assert.equal(doc.querySelector('#country')!.closest('.select')!.querySelector('.select__single-value')!.textContent, 'United States +1')
    assert.equal(
      doc.querySelector('#question_10')!.closest('.select')!.querySelector('.select__single-value')!.textContent,
      'United States',
    )
    assert.equal(
      doc.querySelector('#question_11')!.closest('.select')!.querySelector('.select__single-value')!.textContent,
      'I am authorized to work in the United States for any employer',
    )
    assert.equal(doc.querySelector('#question_12')!.closest('.select')!.querySelector('.select__single-value')!.textContent, 'No')
    assert.equal((doc.getElementById('country') as HTMLInputElement).value, '')
    assert.equal((doc.getElementById('question_11') as HTMLInputElement).value, '')
    assert.deepEqual(keys.sort(), ['country:Escape', 'question_12:Escape'])
  },
)

test('a phone field replaced while typing still receives the full number', async () => {
  const dom = new JSDOM('<!doctype html><body><input id="phone" type="tel" value="" /></body>', {
    url: 'https://job-boards.greenhouse.io/attain/jobs/1',
  })
  installDom(dom)
  const { fillNativeInput } = await import('../src/utils/inputHandlers.ts')
  const doc = dom.window.document
  const first = doc.getElementById('phone') as HTMLInputElement
  first.addEventListener('input', () => {
    if (!first.isConnected || first.value.length !== 1) return
    const next = doc.createElement('input')
    next.id = 'phone'
    next.type = 'tel'
    first.replaceWith(next)
  })
  assert.equal(await fillNativeInput(first, '5551234567'), true)
  assert.equal((doc.getElementById('phone') as HTMLInputElement).value, '5551234567')
  assert.equal(first.isConnected, false)
})
})
