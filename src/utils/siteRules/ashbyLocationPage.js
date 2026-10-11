// Runs in the page (Chrome MAIN world) via chrome.scripting.executeScript.
// The exported command is self-contained: Chrome stringifies that function alone.
// Ashby's location combobox saves {text, providerLocationId} only when an option
// is chosen. An empty search string calls onSelect(null) and stores value null.
// This types a non-empty query, clicks or keyboard-selects the row, and reads
// the saved id. It does not submit the application.

export function sanitizeAshbyLocationCommand(request) {
  if (!request || typeof request !== 'object') return null
  const token = typeof request.token === 'string' ? request.token : ''
  const query = typeof request.query === 'string' ? request.query : ''
  const label = typeof request.label === 'string' ? request.label : ''
  const mode = request.mode === 'keyboard' ? 'keyboard' : 'click'
  const command = typeof request.command === 'string' ? request.command : ''
  if (!/^[a-z0-9]{8,64}$/.test(token)) return null
  if (query.length > 180 || label.length > 180) return null
  if (
    command !== 'typeAshbyLocation' &&
    command !== 'chooseAshbyLocation' &&
    command !== 'readAshbyLocation' &&
    command !== 'clearAshbyLocation'
  ) {
    return null
  }
  return { token, query, label, mode, command }
}

export function ashbyLocationCommandInPage(payload) {
  function collapse(value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  function markedInput(token) {
    if (typeof token !== 'string' || !/^[a-z0-9]{8,64}$/.test(token)) return null
    const input = document.querySelector('input[data-gofillr-location="' + token + '"]')
    return input instanceof HTMLInputElement ? input : null
  }

  function writeInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    const previous = input.value
    if (setter) setter.call(input, value)
    else input.value = value
    if (input._valueTracker) input._valueTracker.setValue(previous)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  }

  function press(input, key) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }))
  }

  function suggestionOptions(input) {
    const controls = input.getAttribute('aria-controls')
    const owned = controls ? document.getElementById(controls) : null
    let root = owned
    if (!root && input.getAttribute('aria-expanded') === 'true') {
      const lists = Array.from(document.querySelectorAll('[role="listbox"]'))
      root = lists.length === 1 ? lists[0] : null
    }
    if (!root) return []
    return Array.from(root.querySelectorAll('[role="option"]'))
  }

  function locationState(input) {
    const key = Object.keys(input).find(
      (name) => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'),
    )
    let fiber = key ? input[key] : null
    for (let depth = 0; depth < 40 && fiber; depth += 1) {
      let hook = fiber.memoizedState
      while (hook) {
        const value = hook.memoizedState
        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'providerLocationId')) {
          return value
        }
        hook = hook.next
      }
      fiber = fiber.return
    }
    return null
  }

  function readValue(input) {
    const selected = locationState(input)
    return {
      value: input.value || '',
      text: selected && typeof selected.text === 'string' ? selected.text : '',
      providerLocationId:
        selected && typeof selected.providerLocationId === 'string' ? selected.providerLocationId : '',
    }
  }

  const command = payload && payload.command
  const input = markedInput(payload && payload.token)
  if (!input) return { found: false, typed: false, chose: false, cleared: false }

  if (command === 'readAshbyLocation') return { found: true, ...readValue(input) }

  if (command === 'clearAshbyLocation') {
    const selected = readValue(input)
    if (selected.providerLocationId) return { cleared: false, found: true, ...selected }
    writeInput(input, '')
    press(input, 'Escape')
    return { cleared: true, found: true }
  }

  if (command === 'typeAshbyLocation') {
    const query = payload && typeof payload.query === 'string' ? payload.query : ''
    if (!query.trim()) return { typed: false, found: true }
    input.focus()
    const wanted = collapse(query)
    if (collapse(input.value) === wanted) {
      const nudge = wanted.length > 1 ? wanted.slice(0, -1) : `${wanted} `
      writeInput(input, nudge)
    }
    writeInput(input, query)
    return { typed: true, found: true, value: input.value }
  }

  const label = payload && typeof payload.label === 'string' ? payload.label : ''
  if (!label) return { chose: false, found: true }
  if (payload.mode === 'keyboard') {
    input.focus()
    const wanted = collapse(label)
    let steps = 0
    const next = () => {
      if (input.getAttribute('aria-expanded') !== 'true') return { chose: false, found: true, ...readValue(input) }
      const options = suggestionOptions(input)
      const active = options.find((option) => option.getAttribute('aria-selected') === 'true')
      if (active && collapse(active.textContent) === wanted) {
        press(input, 'Enter')
        return { chose: true, found: true, ...readValue(input) }
      }
      if (steps >= 16) return { chose: false, found: true, ...readValue(input) }
      steps += 1
      press(input, 'ArrowDown')
      return new Promise((resolve) => setTimeout(() => resolve(next()), 20))
    }
    return next()
  }

  const wanted = collapse(label)
  const option = suggestionOptions(input).find((node) => collapse(node.textContent) === wanted)
  if (!option) return { chose: false, found: true, ...readValue(input) }
  const init = { bubbles: true, cancelable: true, view: window, pointerId: 1 }
  if (typeof PointerEvent === 'function') {
    option.dispatchEvent(new PointerEvent('pointerdown', init))
    option.dispatchEvent(new PointerEvent('pointerup', init))
  }
  option.dispatchEvent(new MouseEvent('mousedown', init))
  option.dispatchEvent(new MouseEvent('mouseup', init))
  option.dispatchEvent(new MouseEvent('click', init))
  return { chose: true, found: true, ...readValue(input) }
}
