// Runs in the page (Chrome MAIN world) via chrome.scripting.executeScript.
// Ashby uploads the File the change event hands it. A File built in the content
// script is not that File: the page can see the name and size, then its own
// FileReader / presigned POST reads an empty or detached blob and shows
// "failed to upload". This function builds the File with the page's constructors.
// It only writes the file input the content script marked. It does not click
// Upload, Submit, or Autofill from resume.

export function resumeBytesForAshby(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return bytes
  if (hasResumeMagic(bytes)) return bytes
  const head = latin1(bytes, 1200).replace(/^\s+/, '')
  let payload = ''
  if (/^data:application\/[^;]+;base64,/.test(head)) {
    payload = latin1(bytes, bytes.length).replace(/^\s+/, '').replace(/^data:application\/[^;]+;base64,/, '')
  } else if (/^(?:JVBERi|UEsDB|0M8R4KGx)/.test(head)) {
    payload = latin1(bytes, bytes.length)
  } else {
    const sample = head.slice(0, 500)
    if (sample.length > 100 && /^[A-Za-z0-9+/]*={0,2}$/.test(sample)) payload = latin1(bytes, bytes.length)
  }
  if (!payload) return bytes
  const decoded = decodeBase64(payload)
  if (!decoded || !hasResumeMagic(decoded)) return bytes
  return decoded
}

export function sanitizeAshbyResumeAssignment(request) {
  if (!request || typeof request !== 'object') return null
  const token = typeof request.token === 'string' ? request.token : ''
  const name = typeof request.name === 'string' ? request.name.trim() : ''
  const type = typeof request.type === 'string' ? request.type.trim() : ''
  const bytesBase64 = typeof request.bytesBase64 === 'string' ? request.bytesBase64.replace(/\s+/g, '') : ''
  if (!/^[a-z0-9]{8,64}$/.test(token)) return null
  if (!name || name.length > 180 || /[\\/]/.test(name)) return null
  if (type.length > 180) return null
  if (!bytesBase64 || bytesBase64.length > 12000000) return null
  const timeoutMs = clampAshbyResumeTimeout(request.timeoutMs)
  return { token, name, type, bytesBase64, timeoutMs }
}

function clampAshbyResumeTimeout(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(120000, Math.floor(value))
}

export function assignAshbyResumeInPage(payload) {
  const token = payload && typeof payload.token === 'string' ? payload.token : ''
  const name = payload && typeof payload.name === 'string' ? payload.name : ''
  const type = payload && typeof payload.type === 'string' ? payload.type : ''
  const encoded = payload && typeof payload.bytesBase64 === 'string' ? payload.bytesBase64 : ''
  const timeoutMs =
    payload && typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0
      ? Math.min(120000, Math.floor(payload.timeoutMs))
      : 0
  if (!/^[a-z0-9]{8,64}$/.test(token) || !name) return { assigned: false }
  const input = document.querySelector('input[type="file"][data-gofillr-resume="' + token + '"]')
  if (!input || input.disabled) return { assigned: false }
  let binary = ''
  try {
    binary = atob(encoded.replace(/\s+/g, ''))
  } catch (error) {
    return { assigned: false }
  }
  if (!binary.length) return { assigned: false }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const file = new File([bytes], name, {
    type: type || 'application/octet-stream',
    lastModified: Date.now(),
  })
  // Ashby reads this File after the change event (a short text sample, then the
  // presigned POST body). Ending this injected turn before that read finishes
  // drops the blob, and the field spins until the request dies. With a timeout,
  // stay in this turn until that POST settles, and abort it if it does not.
  return file.arrayBuffer().then((read) => {
    if (!read || read.byteLength !== bytes.byteLength) return { assigned: false }
    const transfer = new DataTransfer()
    transfer.items.add(file)
    try {
      input.files = transfer.files
    } catch (error) {
      return { assigned: false }
    }
    const assigned = input.files && input.files[0]
    if (!assigned || assigned.name !== name || assigned.size !== bytes.byteLength) return { assigned: false }
    const upload = timeoutMs > 0 ? watchAshbyPresignedUpload(timeoutMs) : null
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    const kept = globalThis.__gofillrResumeTransfers || (globalThis.__gofillrResumeTransfers = [])
    kept.push(transfer)
    if (kept.length > 3) kept.shift()
    try {
      input.removeAttribute('data-gofillr-resume')
    } catch (error) {
      // The marker is only how this function finds the input.
    }
    const result = { assigned: true, name: assigned.name, type: assigned.type, size: assigned.size }
    if (!upload) return result
    return upload.then((outcome) => {
      result.uploaded = outcome.uploaded === true
      if (!result.uploaded) result.error = outcome.error || 'upload-failed'
      if (typeof outcome.status === 'number') result.status = outcome.status
      return result
    })
  }).catch(() => ({ assigned: false }))

  function watchAshbyPresignedUpload(limit) {
    const original = globalThis.fetch
    if (typeof original !== 'function') {
      return Promise.resolve({ uploaded: false, error: 'upload-failed' })
    }
    let restored = false
    let settled = false
    let resolveUpload
    let controller = null
    const done = new Promise((resolve) => {
      resolveUpload = resolve
    })
    const restore = () => {
      if (restored) return
      restored = true
      try {
        globalThis.fetch = original
      } catch (error) {
        // The page fetch is put back so later requests are untouched.
      }
    }
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      restore()
      resolveUpload(value)
    }
    const timer = setTimeout(() => {
      try {
        if (controller) controller.abort()
      } catch (error) {
        // Aborting the hung POST is what stops the field from spinning.
      }
      finish({ uploaded: false, error: 'timeout' })
    }, limit)
    globalThis.fetch = function (input, init) {
      if (settled || !isAshbyPresignedPost(input, init)) return original.apply(this, arguments)
      restore()
      const next = Object.assign({}, init || {})
      if (typeof AbortController === 'function') {
        controller = new AbortController()
        const prior = next.signal
        next.signal = controller.signal
        if (prior && typeof prior.addEventListener === 'function') {
          if (prior.aborted) controller.abort()
          else prior.addEventListener('abort', () => controller.abort(), { once: true })
        }
      }
      return original.call(this, input, next).then(
        (response) => {
          const status = response && typeof response.status === 'number' ? response.status : 0
          const ok = !!(response && (response.ok || status === 204))
          finish({ uploaded: ok, status, error: ok ? undefined : 'upload-failed' })
          return response
        },
        (error) => {
          const aborted = !!(error && (error.name === 'AbortError' || /abort/i.test(String(error.message || error))))
          finish({ uploaded: false, error: aborted ? 'timeout' : 'upload-failed' })
          throw error
        },
      )
    }
    return done
  }

  function isAshbyPresignedPost(input, init) {
    const method = (init && init.method) || (input && input.method) || 'GET'
    if (String(method).toUpperCase() !== 'POST') return false
    // The presigned call posts a form whose file field is the resume. GraphQL is JSON.
    const body = init && init.body
    if (typeof FormData === 'function' && body instanceof FormData) {
      try {
        if (typeof body.get === 'function' && body.get('file')) return true
      } catch (error) {
        // A body we cannot inspect is not this upload.
      }
    }
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input.url === 'string'
          ? input.url
          : input && typeof input.href === 'string'
            ? input.href
            : ''
    return /amazonaws\.com|\/\/[^/]*\.s3[.-]/i.test(url)
  }
}

function hasResumeMagic(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return true
  }
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true
  return bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

function latin1(bytes, max) {
  const count = Math.min(bytes.length, max)
  let text = ''
  for (let i = 0; i < count; i++) text += String.fromCharCode(bytes[i])
  return text
}

function decodeBase64(value) {
  const cleaned = value.replace(/\s+/g, '')
  if (!cleaned || cleaned.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null
  try {
    const binary = atob(cleaned)
    if (!binary.length) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch (error) {
    return null
  }
}
