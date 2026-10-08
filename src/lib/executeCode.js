// In-browser Python via Pyodide, loaded on first Run from the CDN.
//
// Same contract as the platform's server runner: never throws, `failed` means
// the runtime itself could not run (as opposed to the program raising), and the
// result shape is { ok, failed, stdout, stderr, images, durationMs }.
// Runs on the main thread, so a long loop blocks the page. A worker is the next
// step if that bites.

const PYODIDE_VERSION = '0.27.2'
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodidePromise = null

// The first Python run downloads the runtime (about 10 MB, then cached by the browser
// and the service worker). The UI shows that wait instead of an unexplained spinner.
let pythonLoading = false
const loadListeners = new Set()
function setPythonLoading(value) {
  pythonLoading = value
  loadListeners.forEach((fn) => fn(value))
}
export const isPythonLoading = () => pythonLoading
export function subscribePythonLoading(fn) {
  loadListeners.add(fn)
  return () => loadListeners.delete(fn)
}

function loadPyodideRuntime() {
  if (!pyodidePromise) {
    setPythonLoading(true)
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
      return loadPyodide({ indexURL: PYODIDE_URL })
    })()
      .then((py) => { setPythonLoading(false); return py })
      .catch((err) => { pyodidePromise = null; setPythonLoading(false); throw err })
  }
  return pyodidePromise
}

// ── JavaScript ────────────────────────────────────────────────────────────────
// Runs in a throwaway Web Worker so a runaway loop can be killed on a timeout
// and the code never touches the page's DOM, storage or the note itself. Top-
// level `await` works because the source is wrapped in an async function.
const JS_TIMEOUT_MS = 10000

const JS_WORKER_SOURCE = `
const out = []
const fmt = (v) => {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) ?? String(v) } catch { return String(v) }
}
const log = (...a) => out.push(a.map(fmt).join(' '))
self.console = { log, info: log, debug: log, warn: log, error: log }
self.onmessage = async (e) => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    await new AsyncFunction(e.data)()
    self.postMessage({ ok: true, stdout: out.join('\\n') })
  } catch (err) {
    self.postMessage({ ok: false, stdout: out.join('\\n'), error: String((err && err.stack) || err) })
  }
}
`

function executeJavaScript(code) {
  const started = performance.now()
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([JS_WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const finish = (result) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve({ images: [], durationMs: Math.round(performance.now() - started), ...result })
    }
    const timer = setTimeout(
      () => finish({ ok: false, failed: false, stdout: '', stderr: `Stopped: ran longer than ${JS_TIMEOUT_MS / 1000}s.` }),
      JS_TIMEOUT_MS,
    )
    worker.onmessage = ({ data }) =>
      finish(data.ok
        ? { ok: true, failed: false, stdout: data.stdout ? data.stdout + '\n' : '', stderr: '' }
        : { ok: false, failed: false, stdout: data.stdout ? data.stdout + '\n' : '', stderr: data.error })
    worker.onerror = (e) =>
      finish({ ok: false, failed: true, stdout: '', stderr: e.message || 'The JavaScript worker failed to start.' })
    worker.postMessage(code)
  })
}

export async function executeCode(code, language = 'python') {
  if (language === 'javascript') return executeJavaScript(code)
  const started = performance.now()
  let py
  try {
    py = await loadPyodideRuntime()
  } catch (err) {
    return {
      ok: false, failed: true, stdout: '', images: [], durationMs: null,
      stderr: `Could not load the Python runtime (needs a network connection the first time). ${err?.message || ''}`.trim(),
    }
  }

  let stdout = ''
  let stderr = ''
  py.setStdout({ batched: (s) => { stdout += s + '\n' } })
  py.setStderr({ batched: (s) => { stderr += s + '\n' } })

  try {
    await py.loadPackagesFromImports(code)
    await py.runPythonAsync(code)
    return { ok: true, failed: false, stdout, stderr, images: [], durationMs: Math.round(performance.now() - started) }
  } catch (err) {
    // A traceback is a successful request that reports a failed program.
    return {
      ok: false, failed: false, stdout, images: [],
      stderr: stderr || String(err?.message || err),
      durationMs: Math.round(performance.now() - started),
    }
  }
}
