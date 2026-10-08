// Client for the FastAPI backend (backend/). Everything here degrades to a no-op
// when the backend is not running, so the notebook keeps working local-only.
//
// The server runs in one of two modes (see /api/health):
//   local     one notebook, no login. Sync just works.
//   accounts  email + password. Until the reader signs in the app stays local-only.
//
// In dev, Vite proxies /api to http://localhost:8000 (see vite.config.js).

const BASE = '/api'
const TOKEN_KEY = 'nb.apiToken'
const USER_KEY = 'nb.account'
const LAST_USER_KEY = 'nb.account.lastUserId'
const OWN_KEY = 'nb.anthropicKey'
const LAST_SYNC_KEY = 'nb.backend.lastSync'
const PUSH_DEBOUNCE_MS = 1200

function read(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function write(key, value) {
  try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* storage blocked */ }
}

function headers(extra = {}) {
  const token = read(TOKEN_KEY)
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

// ── status the UI can show ────────────────────────────────────────────────────
// state: 'local'    no server, notes live on this device
//        'signin'   server wants a login and there is none
//        'syncing' | 'synced' | 'offline' | 'error' | 'conflict'
let _status = { state: 'local', auth: 'local', email: null, registration: true, dailyAgentCalls: null, lastSyncedAt: null, message: '' }
const _listeners = new Set()

export function getBackendStatus() { return _status }
export function subscribeBackend(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
function setStatus(patch) {
  const next = { ..._status, ...patch }
  if (Object.keys(next).every((k) => next[k] === _status[k])) return
  _status = next
  for (const fn of _listeners) fn(_status)
}

function signedIn() { return Boolean(read(TOKEN_KEY)) }
// Whether this browser may talk to the notes API right now.
function mayUseNotes() {
  return _status.auth !== 'accounts' || signedIn()
}
function restingState() {
  if (_up === false) return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'local'
  if (_status.auth === 'accounts' && !signedIn()) return 'signin'
  return 'synced'
}

// null = not probed yet. Probed once; a failed probe is retried after a pause so
// starting the backend later is picked up without a reload.
let _up = null
let _probedAt = 0
const REPROBE_MS = 15000

export async function backendUp() {
  if (_up === true) return true
  if (_up === false && Date.now() - _probedAt < REPROBE_MS) return false
  _probedAt = Date.now()
  try {
    const res = await fetch(`${BASE}/health`)
    _up = res.ok
    if (res.ok) {
      const info = await res.json().catch(() => ({}))
      setStatus({
        auth: info.auth || 'local',
        registration: info.registration !== false,
        dailyAgentCalls: info.dailyAgentCalls ?? null,
        email: read(USER_KEY) || null,
      })
    }
  } catch {
    _up = false
  }
  setStatus({ state: restingState() })
  return _up
}

// A 401 on the notes API means the saved login expired or was revoked.
function handleUnauthorized(res) {
  if (res.status !== 401) return false
  if (_status.auth === 'accounts') {
    write(TOKEN_KEY, '')
    setStatus({ state: 'signin', email: null, message: 'Your session ended. Sign in again to keep syncing.' })
  }
  return true
}

export async function backendPush(note) {
  if (!(await backendUp()) || !mayUseNotes()) return false
  setStatus({ state: 'syncing' })
  try {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(note.id)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ ...note, syncedAt: undefined }),
    })
    if (handleUnauthorized(res)) return false
    if (res.status === 409) {
      // The server holds something newer. Surface it rather than overwrite it.
      window.dispatchEvent(new CustomEvent('nb:backend-conflict', { detail: { id: note.id } }))
      setStatus({ state: 'conflict' })
      return false
    }
    setStatus(res.ok ? { state: 'synced', lastSyncedAt: Date.now(), message: '' } : { state: 'error', message: 'Could not save to the server. Your notes are safe on this device.' })
    return res.ok
  } catch {
    _up = false
    setStatus({ state: restingState() })
    return false
  }
}

const _timers = new Map()
export function backendPushDebounced(note) {
  clearTimeout(_timers.get(note.id))
  _timers.set(note.id, setTimeout(() => { _timers.delete(note.id); backendPush(note) }, PUSH_DEBOUNCE_MS))
}

export async function backendDelete(id) {
  clearTimeout(_timers.get(id))
  _timers.delete(id)
  if (!(await backendUp()) || !mayUseNotes()) return false
  try {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() })
    if (handleUnauthorized(res)) return false
    return res.ok
  } catch {
    _up = false
    return false
  }
}

// Push notes changed since the last sync, pull what the server changed (including
// what an agent wrote). `localNotes` is the current local list; `apply` writes the
// server's notes into the local store. Returns how many local notes changed.
// (`apply` must return a count.)
export async function syncBackend(localNotes, apply, onConflicts) {
  if (!(await backendUp()) || !mayUseNotes()) return 0
  const since = Number(read(LAST_SYNC_KEY)) || 0
  const outgoing = localNotes.filter((n) => (n.updatedAt || 0) > since).map((n) => ({ ...n, syncedAt: undefined }))
  setStatus({ state: 'syncing' })
  try {
    const res = await fetch(`${BASE}/notes/sync`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ since, notes: outgoing }),
    })
    if (handleUnauthorized(res)) return 0
    if (!res.ok) {
      setStatus({ state: 'error', message: 'Syncing failed. Your notes are safe on this device; it will retry.' })
      return 0
    }
    const data = await res.json()
    // Notes the server refused (it holds a newer version) go to onConflicts, which
    // keeps this device's text as a separate copy instead of overwriting it.
    const changed = apply(data.changes) + (onConflicts ? onConflicts(data.conflicts) : apply(data.conflicts))
    write(LAST_SYNC_KEY, String(data.serverTime))
    setStatus({ state: data.conflicts.length ? 'conflict' : 'synced', lastSyncedAt: Date.now(), message: '' })
    return changed
  } catch {
    _up = false
    setStatus({ state: restingState() })
    return 0
  }
}

// ── accounts ──────────────────────────────────────────────────────────────────
async function authRequest(path, email, password) {
  let res
  try {
    res = await fetch(`${BASE}/auth/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(readableError(body, res.status))
  return body
}

// FastAPI sends {detail: "text"} or, for validation, {detail: [{msg}]}.
function readableError(body, status) {
  const d = body?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) {
    const field = d[0].loc?.[d[0].loc.length - 1]
    if (field === 'password') return 'Use a password of at least 8 characters.'
    return String(d[0].msg).replace(/^Value error, /, '')
  }
  if (status === 429) return 'Too many tries. Wait a minute and try again.'
  return `Something went wrong (${status}).`
}

// Returns { wiped } so the caller can say that another account's notes were removed
// from this device before this account's notes were loaded.
async function finishSignIn(session, { clearLocal }) {
  const previous = read(LAST_USER_KEY)
  let wiped = false
  if (previous && previous !== session.user.id) {
    // Different person on a shared browser: their notes must not flow into this account.
    clearLocal()
    wiped = true
  }
  write(TOKEN_KEY, session.token)
  write(USER_KEY, session.user.email)
  write(LAST_USER_KEY, session.user.id)
  write(LAST_SYNC_KEY, '')
  setStatus({ state: 'synced', email: session.user.email, message: '' })
  return { wiped }
}

export async function signUp(email, password, hooks) {
  await backendUp()
  return finishSignIn(await authRequest('register', email, password), hooks)
}
export async function signIn(email, password, hooks) {
  await backendUp()
  return finishSignIn(await authRequest('login', email, password), hooks)
}

// `clearLocal()` is called when the reader asks to remove this account's notes from
// the device (the default on a shared computer). The notes stay on the server.
export function signOut({ removeLocal = false, clearLocal } = {}) {
  write(TOKEN_KEY, '')
  write(USER_KEY, '')
  write(LAST_SYNC_KEY, '')
  if (removeLocal) { clearLocal?.(); write(LAST_USER_KEY, '') }
  setStatus({ state: 'signin', email: null, message: '' })
}

// Permanently deletes the server copy of every note (and, when `account`, the login).
export async function deleteRemoteData({ account = false } = {}) {
  if (!(await backendUp()) || !mayUseNotes()) return false
  try {
    const res = await fetch(account ? `${BASE}/auth/me` : `${BASE}/notes`, { method: 'DELETE', headers: headers() })
    if (handleUnauthorized(res)) return false
    if (res.ok && account) signOut({ removeLocal: false })
    return res.ok
  } catch {
    return false
  }
}

// ── agents ────────────────────────────────────────────────────────────────────
// A reader may bring their own Anthropic key. It is sent only with agent requests,
// held in this browser, and the server uses it for that request without storing it.
export function getOwnKey() { return read(OWN_KEY) }
export function setOwnKey(key) { write(OWN_KEY, (key || '').trim()) }

export function agentsAvailable() {
  return _up !== false && mayUseNotes()
}

export async function listAgents() {
  if (!(await backendUp()) || !mayUseNotes()) return null
  const res = await fetch(`${BASE}/agents`, { headers: headers() })
  return res.ok ? res.json() : null
}

// Chat with an agent. Calls `onEvent` for each server-sent event ({type: 'text' |
// 'thinking' | 'tool_use' | 'tool_result' | 'done' | 'error', ...}). Resolves when
// the stream ends; abort with the signal.
export async function chatWithAgent(key, messages, { focusNoteId, signal, onEvent }) {
  const own = getOwnKey()
  const res = await fetch(`${BASE}/agents/${encodeURIComponent(key)}/chat`, {
    method: 'POST',
    headers: headers(own ? { 'X-Anthropic-Key': own } : {}),
    signal,
    body: JSON.stringify({ messages, focus_note_id: focusNoteId || null }),
  })
  if (!res.ok || !res.body) {
    if (res.status === 401) handleUnauthorized(res)
    const body = await res.json().catch(() => ({}))
    onEvent({ type: 'error', message: res.status === 401 ? 'Please sign in to use the assistant.' : readableError(body, res.status) })
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      if (!frame.startsWith('data: ')) continue
      try { onEvent(JSON.parse(frame.slice(6))) } catch { /* ignore a malformed frame */ }
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { _up = null; backendUp() })
  window.addEventListener('offline', () => setStatus({ state: restingState() }))
}
