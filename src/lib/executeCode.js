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

function loadPyodideRuntime() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
      return loadPyodide({ indexURL: PYODIDE_URL })
    })().catch((err) => { pyodidePromise = null; throw err })
  }
  return pyodidePromise
}

export async function executeCode(code) {
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
