// Research Notebook — persistence + data model.
//
// Notes are local JSON documents made of ordered blocks. The model stays
// intentionally small and portable: text, runnable code, sketches and
// plots. Folder/pin metadata is optional and backward-compatible with older
// notes already saved in localStorage.
//
// Local-first + best-effort cloud sync (signed-in users only): every mutation
// still writes to localStorage synchronously first — that's the source of
// truth the UI reads — then fires an async Supabase upsert/delete in the
// background (see remoteUpsert/remoteDelete). A failed remote call is logged
// and swallowed; the local write already succeeded, matching the fallback
// pattern used by lib/progress.js. syncWithRemote() (called on notebook page
// mount) reconciles the two sides.
//
// Three rules make that reconciliation trustworthy, and they are the whole of
// the sync design:
//
//   1. Deletes are tombstones, not row removals. A local note with no remote
//      row is ambiguous — it could be a note the server has never seen, or one
//      the user deleted elsewhere. The push side used to read it as the former
//      and re-upload, which meant a delete on device A came *back* on device A
//      after device B synced. `deleted_at` on the row settles it. Deletes made
//      while offline or signed out are queued locally (see tombstones below)
//      and replayed on the next sync.
//
//   2. `syncedAt` distinguishes "edited here" from "edited elsewhere".
//      Comparing `updatedAt` alone can only pick a winner; it cannot tell that
//      *both* sides moved. Each note remembers the `updatedAt` the server last
//      confirmed, so a divergence is detectable rather than silently resolved
//      in favour of whichever clock ran faster. `syncedAt` is local-only
//      bookkeeping and is deliberately not a column.
//
//   3. A conflict never discards text. When both sides moved, local wins the
//      note and the remote body is preserved as a separate conflict copy. The
//      user can compare and delete one; they cannot get their words back if we
//      pick for them.

import { getSupabase, getUser } from '../auth.js'
import { saveVersion } from './versions.js'
import { backendPush, backendPushDebounced, backendDelete } from '../backend.js'

const STORE_KEY = 'qcb.notebook.notes'
const TOMBSTONE_KEY = 'qcb.notebook.tombstones'

export const DEFAULT_FOLDER = 'General'

// ── ids ───────────────────────────────────────────────────────────────────────
let _counter = 0
export function newId(prefix = 'n') {
  _counter += 1
  return `${prefix}${Date.now().toString(36)}_${_counter}`
}

// ── block factories ───────────────────────────────────────────────────────────
export function textBlock(markdown = '') {
  return { id: newId('b'), type: 'text', markdown }
}

// Languages a code block can run. Notes saved before the notebook was
// generalised carry 'qiskit' / 'cirq' / 'pennylane' — all of those were Python.
export const CODE_LANGUAGES = [
  { id: 'python', label: 'Python', monaco: 'python' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
]

export function normalizeLanguage(value) {
  return CODE_LANGUAGES.some((l) => l.id === value) ? value : 'python'
}

export function codeBlock({ framework = 'python', code = '' } = {}) {
  return { id: newId('b'), type: 'code', framework: normalizeLanguage(framework), code, lastResult: null }
}

export const BLOCK_FACTORIES = {
  text: () => textBlock(''),
  code: () => codeBlock(),
}

// ── store ─────────────────────────────────────────────────────────────────────
// Mirrors the CHECK constraint in migration 010. Anything that isn't a
// well-formed attachment becomes null — an unattached note is always a valid
// state, so there is never a reason to keep a broken one.
const ATTACHMENT_KINDS = new Set(['lesson', 'project'])

function normalizeAttachment(value) {
  if (!value || typeof value !== 'object') return null
  const { kind, id, label } = value
  if (!ATTACHMENT_KINDS.has(kind)) return null
  if (typeof id !== 'string' || !id) return null
  return { kind, id, label: typeof label === 'string' ? label : '' }
}

// Circuit blocks were removed when the notebook stopped being quantum-specific.
// A saved one becomes a short text block rather than vanishing, so nothing a
// reader wrote is lost silently; code blocks fold their old framework into a
// language.
function normalizeBlock(block) {
  if (block?.type === 'circuit') {
    return { id: block.id || newId('b'), type: 'text', markdown: `> Circuit block removed${block.name ? `: ${block.name}` : ''}` }
  }
  if (block?.type === 'code') return { ...block, framework: normalizeLanguage(block.framework) }
  return block
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') return null

  return {
    ...note,
    title: note.title || 'Untitled note',
    content: Array.isArray(note.content) ? note.content.map(normalizeBlock) : [textBlock('')],
    tags: Array.isArray(note.tags) ? note.tags : [],
    folder: note.folder || DEFAULT_FOLDER,
    pinned: Boolean(note.pinned),
    // What this note is about, if anything: a lesson or a project. Validated
    // here rather than trusted, because it drives a link — a half-formed value
    // would render as a chip pointing nowhere.
    attachedTo: normalizeAttachment(note.attachedTo),
    createdAt: note.createdAt || Date.now(),
    updatedAt: note.updatedAt || note.createdAt || Date.now(),
    // Local-only: the `updatedAt` the server last confirmed for this note.
    // `undefined` means "never synced under the syncedAt rules" and is treated
    // as a legacy note by the merge — see reconcileNote(). Not a column, and
    // noteToRow() must never send it.
    syncedAt: typeof note.syncedAt === 'number' ? note.syncedAt : undefined,
  }
}

// Parsing + normalizing every note on each read is wasteful when the notebook
// re-reads on every keystroke (search, backlinks). Cache the parsed result keyed
// by the raw JSON string, so an unchanged store — including one changed in
// another tab — is only ever parsed once.
let _cacheRaw = null
let _cacheVal = null

function readStore() {
  let raw
  try {
    raw = localStorage.getItem(STORE_KEY) || '{}'
  } catch {
    return {}
  }
  if (raw === _cacheRaw && _cacheVal) return _cacheVal
  try {
    const parsed = JSON.parse(raw) || {}
    const value = Object.fromEntries(
      Object.entries(parsed)
        .map(([id, note]) => [id, normalizeNote(note)])
        .filter(([, note]) => Boolean(note)),
    )
    _cacheRaw = raw
    _cacheVal = value
    return value
  } catch {
    return {}
  }
}

// Returns true on success, false if the write was rejected (quota exceeded or
// storage disabled) so callers can surface a real "couldn't save" state instead
// of silently losing data.
function writeStore(obj) {
  try {
    const raw = JSON.stringify(obj)
    localStorage.setItem(STORE_KEY, raw)
    _cacheRaw = raw
    _cacheVal = obj
    return true
  } catch {
    _cacheRaw = null // force a fresh read next time
    return false
  }
}

// Rough localStorage footprint for the notebook, in bytes, plus a usage ratio
// against the ~5 MB budget most browsers enforce. Used to warn before saves fail.
const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024

// Thresholds are shared so the warning banner and the embed guard can never
// disagree about what "nearly full" means. `critical` is the point at which new
// bulk (an embedded image) is refused: a quota error raised at save time is a
// terrible first warning, because by then the user has already done the work.
export const STORAGE_WARN_RATIO = 0.75
export const STORAGE_CRITICAL_RATIO = 0.9

export function getStorageInfo() {
  let used = 0
  try {
    used = (localStorage.getItem(STORE_KEY) || '').length * 2 // UTF-16 code units
  } catch {
    /* ignore */
  }
  const ratio = used / STORAGE_BUDGET_BYTES
  const level = ratio >= STORAGE_CRITICAL_RATIO ? 'critical' : ratio >= STORAGE_WARN_RATIO ? 'warn' : 'ok'
  return { usedBytes: used, budgetBytes: STORAGE_BUDGET_BYTES, ratio, level }
}

// ── tombstones (local queue of deletes not yet confirmed by the server) ──────
// A delete made while offline, or while signed out and later signed in, has no
// remote row to mark. Without a record of it, the next sync pulls the note
// straight back. Entries are cleared once the server confirms the tombstone.
function readTombstones() {
  try {
    return JSON.parse(localStorage.getItem(TOMBSTONE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeTombstones(map) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map))
    return true
  } catch {
    return false
  }
}

function recordTombstone(id) {
  const map = readTombstones()
  map[id] = Date.now()
  writeTombstones(map)
}

function clearTombstone(id) {
  const map = readTombstones()
  if (!(id in map)) return
  delete map[id]
  writeTombstones(map)
}

export function getPendingDeleteCount() {
  return Object.keys(readTombstones()).length
}

// ── sync status (subscribable) ───────────────────────────────────────────────
// "Saved" in the editor used to mean only "written to this browser", which is
// the one thing a user reading it does not need reassurance about. These states
// separate the local write from the server's acknowledgement, so an edit that
// never left the tab is visibly different from one that landed.
//
//   signedOut — local only, by design; nothing is pending
//   offline   — the browser says there's no connection; edits are queued
//   pending   — queued locally, waiting for the debounce or a retry
//   syncing   — a push or pull is in flight
//   synced    — the server has confirmed everything we've written
//   conflict  — a divergence was detected; a conflict copy exists
//   error     — the last remote call failed; will retry on the next sync
export const SYNC_STATES = ['signedOut', 'offline', 'pending', 'syncing', 'synced', 'conflict', 'error']

let _syncStatus = {
  state: 'signedOut',
  pending: 0, // notes queued for push
  pendingDeletes: 0, // tombstones not yet confirmed
  lastSyncedAt: null,
  lastError: null,
  conflicts: [], // [{ id, title, conflictId }] since the last acknowledgement
}

const _syncListeners = new Set()

export function getSyncStatus() {
  return _syncStatus
}

export function subscribeSyncStatus(fn) {
  // The module-level default assumes signed out, because auth may not have
  // resolved at import time. Re-derive on the first subscribe so a page that
  // mounts after sign-in doesn't render "Local only" until the next edit.
  refreshRestingStatus()
  _syncListeners.add(fn)
  fn(_syncStatus)
  return () => _syncListeners.delete(fn)
}

function setSyncStatus(patch) {
  const next = { ..._syncStatus, ...patch }
  // Cheap equality guard: this fires on every queued keystroke batch, and a
  // no-op re-render of the notebook page is not free.
  const same = Object.keys(next).every((k) => next[k] === _syncStatus[k])
  if (same) return
  _syncStatus = next
  for (const fn of _syncListeners) {
    try {
      fn(_syncStatus)
    } catch {
      /* a broken subscriber must not stop the others */
    }
  }
}

// Derive the resting state from what's actually outstanding. Called after every
// queue change so the indicator can't get stuck on "Saving…" after a flush.
function refreshRestingStatus() {
  if (!getUser()?.id) {
    setSyncStatus({ state: 'signedOut', pending: 0, pendingDeletes: 0, conflicts: [] })
    return
  }
  const pending = _pendingPush.size
  const pendingDeletes = getPendingDeleteCount()
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  // Order matters, and `error` deliberately outranks `pending`: after a failed
  // call the queue is non-empty *because* of the failure, so reporting
  // "Pending" would describe the symptom and hide the cause — indistinguishable
  // from a sync that is merely slow. `lastError` clears on the next success.
  let state
  if (offline) state = 'offline'
  else if (_syncStatus.conflicts.length) state = 'conflict'
  else if (_syncStatus.lastError) state = 'error'
  else if (pending || pendingDeletes) state = 'pending'
  else state = 'synced'
  setSyncStatus({ state, pending, pendingDeletes })
}

// The conflict banner is dismissible; clearing it must also drop the state back
// to whatever is actually outstanding.
export function acknowledgeConflicts() {
  setSyncStatus({ conflicts: [] })
  refreshRestingStatus()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    refreshRestingStatus()
    flushRemoteUpserts()
  })
  window.addEventListener('offline', refreshRestingStatus)
}

// ── remote sync (Supabase, signed-in users only) ────────────────────────────
const REMOTE_TABLE = 'notebook_notes'

function rowToNote(row) {
  return normalizeNote({
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags || [],
    folder: row.folder,
    pinned: row.pinned,
    templateType: row.template_type || undefined,
    attachedTo: row.attached_to || null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  })
}

function noteToRow(note, userId) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    tags: note.tags,
    folder: note.folder,
    pinned: note.pinned,
    template_type: note.templateType || null,
    attached_to: note.attachedTo || null,
    created_at: new Date(note.createdAt || Date.now()).toISOString(),
    updated_at: new Date(note.updatedAt || Date.now()).toISOString(),
    // Writing a live note always clears any tombstone on that id, which is what
    // makes restoreNote() (and undo on the delete toast) revive the remote row
    // rather than leaving it marked deleted for every other device.
    deleted_at: null,
    // `syncedAt` is intentionally absent — it is local bookkeeping about this
    // browser's relationship to the row, not a property of the row.
  }
}

// Stamp the note's confirmed watermark after the server accepts it. Read-modify
// -write against the live store rather than the caller's copy: the note may
// have been edited again while the request was in flight, and clobbering that
// with a stale body would lose the newer keystrokes.
function markSynced(id, syncedAt) {
  const store = readStore()
  const current = store[id]
  if (!current) return // deleted while the push was in flight; nothing to stamp
  writeStore({ ...store, [id]: { ...current, syncedAt } })
}

async function remoteUpsert(note) {
  backendPush(note) // FastAPI backend, when it is running; a no-op otherwise
  const userId = getUser()?.id
  if (!userId) return false
  try {
    const { error } = await (await getSupabase()).from(REMOTE_TABLE).upsert(noteToRow(note, userId))
    if (error) throw error
    markSynced(note.id, note.updatedAt || 0)
    clearTombstone(note.id) // a successful write means the note is live again
    setSyncStatus({ lastError: null, lastSyncedAt: Date.now() })
    refreshRestingStatus()
    return true
  } catch (err) {
    console.warn('[notebook] remote save failed, kept locally:', err?.message)
    setSyncStatus({ lastError: err?.message || 'Sync failed' })
    refreshRestingStatus()
    return false
  }
}

// The editor autosaves every ~400ms while typing. Pushing each of those to
// Supabase meant a full-note upload several times a second for as long as
// someone kept writing. Coalesce instead: hold the latest version of each note
// and push once the user pauses. The local write already happened synchronously,
// so nothing here is on the critical path — and syncWithRemote() is the backstop
// that pushes anything a closed tab never got around to sending.
const REMOTE_PUSH_DELAY_MS = 2500 // quiet period before pushing
const REMOTE_PUSH_MAX_WAIT_MS = 15000 // …but never sit on an edit longer than this
const _pendingPush = new Map() // id → latest note
let _pushTimer = null
let _oldestPendingAt = 0

function flushRemoteUpserts() {
  clearTimeout(_pushTimer)
  _pushTimer = null
  _oldestPendingAt = 0
  if (_pendingPush.size === 0) {
    refreshRestingStatus()
    return
  }
  const notes = [..._pendingPush.values()]
  _pendingPush.clear()
  setSyncStatus({ state: 'syncing' })
  // Re-queue anything the server rejected instead of dropping it: the note is
  // safe locally either way, but a silently abandoned push means the edit never
  // reaches the other device and nothing ever says so.
  Promise.all(notes.map((note) => remoteUpsert(note).then((ok) => ({ ok, note })))).then((results) => {
    const failed = results.filter((r) => !r.ok).map((r) => r.note)
    for (const note of failed) if (!_pendingPush.has(note.id)) _pendingPush.set(note.id, note)
    refreshRestingStatus()
  })
}

function scheduleRemoteUpsert(note) {
  if (!getUser()?.id) return
  const now = Date.now()
  if (_pendingPush.size === 0) _oldestPendingAt = now
  _pendingPush.set(note.id, note)
  // A plain trailing debounce would starve: autosave fires every ~400ms while
  // someone types, resetting the timer each time, so a long writing session
  // would never reach the server. Cap the wait so a push always lands.
  const delay = Math.min(REMOTE_PUSH_DELAY_MS, Math.max(0, REMOTE_PUSH_MAX_WAIT_MS - (now - _oldestPendingAt)))
  clearTimeout(_pushTimer)
  _pushTimer = setTimeout(flushRemoteUpserts, delay)
  refreshRestingStatus()
}

// A pending push must never outlive the note it belongs to, or a delete would be
// undone by an upsert that was still in the queue.
function cancelPendingPush(id) {
  _pendingPush.delete(id)
}

// Don't sit on unsent edits when the tab goes away. `visibilitychange` is the
// reliable one (`beforeunload` often gets no chance to finish an async call),
// and it also covers tab-switching, which is when people usually stop typing.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushRemoteUpserts()
  })
  window.addEventListener('pagehide', flushRemoteUpserts)
}

// Soft delete. The row survives as a tombstone so other devices learn the note
// is gone; hard-deleting it made a local copy on device B indistinguishable
// from an unsynced new note, which the push side then uploaded again.
//
// `content` is emptied at the same time: a tombstone only needs to say "this id
// is dead", and keeping the body would leave deleted text on the server
// indefinitely for a row the user believes they removed.
async function remoteDelete(id) {
  backendDelete(id)
  const userId = getUser()?.id
  // Signed out, there is nothing to mark — but the local tombstone recorded by
  // deleteNote() stays, and the first sync after signing in replays it.
  if (!userId) return false
  try {
    const { error } = await (await getSupabase())
      .from(REMOTE_TABLE)
      .update({ deleted_at: new Date().toISOString(), content: [] })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    clearTombstone(id)
    setSyncStatus({ lastError: null })
    refreshRestingStatus()
    return true
  } catch (err) {
    // Keep the local tombstone: the delete is real locally and must be replayed.
    console.warn('[notebook] remote delete failed, will retry on next sync:', err?.message)
    setSyncStatus({ lastError: err?.message || 'Delete not synced' })
    refreshRestingStatus()
    return false
  }
}

// Title suffix for the copy kept when both sides of a note moved. Exported so
// the UI can recognise (and the tests can assert on) a conflict copy without
// re-deriving the string.
export const CONFLICT_SUFFIX = ' (conflicted copy from another device)'

// Decide what to do with one live remote row against its local counterpart.
// Split out from the loop below because this is the whole of the merge policy
// and it is worth reading on its own.
//
//   dirty  = this browser has edits the server has not confirmed
//   moved  = the server's copy changed since we last confirmed it
//
// Both false → nothing to do. Only `moved` → fast-forward. Only `dirty` → our
// push handles it. Both → a genuine divergence, and neither side may be thrown
// away, so local keeps the note and remote becomes a conflict copy.
function reconcileNote(local, remote) {
  if (!local) return { action: 'adopt' }

  // Legacy notes predate `syncedAt` and have no watermark to reason from.
  // Treating that as "never confirmed" would mark every one of them dirty and
  // manufacture a conflict copy for each on first upgrade, which is a worse
  // outcome than the old behaviour. Fall back to last-writer-wins once, and the
  // watermark written here puts the note on the new rules from then on.
  if (local.syncedAt == null) {
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? { action: 'adopt' } : { action: 'keep-local' }
  }

  const dirty = (local.updatedAt || 0) > local.syncedAt
  const moved = (remote.updatedAt || 0) > local.syncedAt

  if (!moved) return { action: dirty ? 'keep-local' : 'none' }
  if (!dirty) return { action: 'adopt' }
  return { action: 'conflict' }
}

// Reconcile the local store with the server. Safe to call repeatedly (e.g. on
// every notebook page mount) — a no-op once both sides agree.
//
// Returns { synced, conflicts, adopted, deleted, pushed }; `synced: false` when
// signed out, offline, or the fetch failed.
export async function syncWithRemote() {
  const userId = getUser()?.id
  if (!userId) {
    refreshRestingStatus()
    return { synced: false, reason: 'signedOut', conflicts: [] }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    refreshRestingStatus()
    return { synced: false, reason: 'offline', conflicts: [] }
  }

  setSyncStatus({ state: 'syncing' })

  // Drop the debounce queue and let the reconciliation below own the push.
  // Every queued note is dirty by definition, so the merge picks it up anyway —
  // and leaving the timer armed meant a queued edit could land *after* the pull
  // had already decided what to do with that note, re-pushing a body the merge
  // had just superseded. It also left the indicator reading "Pending" straight
  // after a sync that had in fact sent everything.
  clearTimeout(_pushTimer)
  _pushTimer = null
  _oldestPendingAt = 0
  const drained = [..._pendingPush.values()]
  _pendingPush.clear()

  try {
    const { data, error } = await (await getSupabase()).from(REMOTE_TABLE).select('*').eq('user_id', userId)
    if (error) throw error

    const rows = data || []
    const store = readStore()
    const merged = { ...store }
    const tombstones = readTombstones()

    const conflicts = []
    const toPush = []
    const toTombstone = []
    let adopted = 0
    let deletedLocally = 0
    let changed = false

    const seen = new Set()

    for (const row of rows) {
      seen.add(row.id)
      const local = merged[row.id]

      // ── the row is a tombstone ──────────────────────────────────────────
      if (row.deleted_at) {
        clearTombstone(row.id) // the server already knows; stop replaying it
        if (!local) continue
        const deletedAt = Date.parse(row.deleted_at) || 0
        // An edit made *after* the delete is a deliberate resurrection (the
        // user restored it, or undid the delete on this device). Honour it and
        // push, rather than deleting work the user can see in front of them.
        if ((local.updatedAt || 0) > deletedAt) {
          toPush.push(local)
        } else {
          delete merged[row.id]
          deletedLocally += 1
          changed = true
        }
        continue
      }

      // ── the row is live ─────────────────────────────────────────────────
      const remote = rowToNote(row)
      const { action } = reconcileNote(local, remote)

      if (action === 'adopt') {
        merged[row.id] = { ...remote, syncedAt: remote.updatedAt || 0 }
        adopted += 1
        changed = true
      } else if (action === 'keep-local') {
        toPush.push(local)
      } else if (action === 'conflict') {
        // Local keeps the note and the id, so wiki-links and backlinks stay
        // pointed at the copy the user has been editing. The server's version
        // is preserved beside it under a fresh id.
        const copyId = newId('note')
        merged[copyId] = normalizeNote({
          ...remote,
          id: copyId,
          title: `${remote.title || 'Untitled note'}${CONFLICT_SUFFIX}`,
          pinned: false,
          syncedAt: undefined, // never been on the server under this id
        })
        // Move the watermark to what the server currently holds. Without this
        // the same divergence re-fires on every sync and breeds a copy each
        // time; with it, the local note is merely dirty and pushes normally.
        merged[row.id] = { ...local, syncedAt: remote.updatedAt || 0 }
        conflicts.push({ id: row.id, title: local.title || 'Untitled note', conflictId: copyId })
        toPush.push(merged[row.id], merged[copyId])
        changed = true
      }
    }

    // Local notes with no row at all. Before tombstones this was the ambiguous
    // case; now anything genuinely deleted elsewhere carries a row, so a note
    // missing entirely really is one the server has never seen.
    for (const note of Object.values(merged)) {
      if (!seen.has(note.id) && !toPush.includes(note)) toPush.push(note)
    }

    // Replay deletes this browser made while offline or signed out. A tombstone
    // whose row is missing or already marked needs no replay — the loop above
    // cleared those ids as it saw them.
    for (const id of Object.keys(tombstones)) {
      if (seen.has(id)) toTombstone.push(id)
      else clearTombstone(id) // no row to mark; nothing to propagate
    }

    // Write before pushing: remoteUpsert stamps `syncedAt` against the live
    // store, so the merged result has to be the live store by then.
    if (changed) writeStore(merged)

    for (const id of toTombstone) await remoteDelete(id)
    for (const note of toPush) await remoteUpsert(note)

    setSyncStatus({
      lastSyncedAt: Date.now(),
      lastError: null,
      conflicts: conflicts.length ? [..._syncStatus.conflicts, ...conflicts] : _syncStatus.conflicts,
    })
    refreshRestingStatus()

    return { synced: true, conflicts, adopted, deleted: deletedLocally, pushed: toPush.length }
  } catch (err) {
    // The reconciliation never ran, so put the drained queue back rather than
    // relying on the next sync to notice — a failed fetch must not be the thing
    // that strands an edit the debounce had already accepted.
    for (const note of drained) if (!_pendingPush.has(note.id)) _pendingPush.set(note.id, note)
    console.warn('[notebook] sync failed:', err?.message)
    setSyncStatus({ lastError: err?.message || 'Sync failed' })
    refreshRestingStatus()
    return { synced: false, reason: 'error', conflicts: [] }
  }
}

// Pull a single note by id directly from Supabase (bypassing the local-store
// merge above) — used when a note is opened by id but isn't in this browser's
// localStorage yet, e.g. a link followed on a device that hasn't synced.
export async function fetchNoteRemote(id) {
  const userId = getUser()?.id
  if (!userId) return null
  try {
    const { data, error } = await (await getSupabase())
      .from(REMOTE_TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      // A tombstoned row must not resolve, or following a stale link would pull
      // a deleted note back into this browser's store.
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const note = { ...rowToNote(data), syncedAt: rowToNote(data).updatedAt || 0 }
    writeStore({ ...readStore(), [note.id]: note })
    return note
  } catch (err) {
    console.warn('[notebook] remote fetch failed:', err?.message)
    return null
  }
}

// Pinned first, then newest first.
export function listNotes() {
  return Object.values(readStore()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })
}

export function getNote(id) {
  return readStore()[id] || null
}

export function createNote({
  title = 'Untitled note',
  content,
  tags = [],
  folder = DEFAULT_FOLDER,
  pinned = false,
  templateType,
  attachedTo = null,
} = {}) {
  const now = Date.now()
  const note = {
    id: newId('note'),
    title,
    content: content && content.length ? content : [textBlock('')],
    tags,
    folder: folder || DEFAULT_FOLDER,
    pinned: Boolean(pinned),
    templateType,
    attachedTo: normalizeAttachment(attachedTo),
    createdAt: now,
    updatedAt: now,
  }
  const store = { ...readStore(), [note.id]: note }
  writeStore(store)
  remoteUpsert(note)
  return note
}

// Patch is shallow-merged; `updatedAt` is always refreshed. Returns the saved
// note, or `null` if it doesn't exist OR the write was rejected (e.g. storage
// full) — callers that autosave should treat `null` as "save failed".
export function updateNote(id, patch) {
  const store = readStore()
  const existing = store[id]
  if (!existing) return null
  const next = normalizeNote({ ...existing, ...patch, id, updatedAt: Date.now() })
  const ok = writeStore({ ...store, [id]: next })
  // Debounced: this is the autosave path and runs on a keystroke cadence.
  if (ok) {
    scheduleRemoteUpsert(next)
    backendPushDebounced(next)
  }
  return ok ? next : null
}

export function duplicateNote(id) {
  const source = getNote(id)
  if (!source) return null

  return createNote({
    title: `${source.title || 'Untitled note'} copy`,
    content: (source.content || []).map((block) => ({
      ...block,
      id: newId('b'),
      lastResult: block.type === 'code' ? null : block.lastResult,
    })),
    tags: [...(source.tags || [])],
    folder: source.folder || DEFAULT_FOLDER,
    pinned: false,
    templateType: source.templateType,
    // A duplicate is still about the same lesson; dropping the attachment would
    // quietly remove it from that lesson's note list.
    attachedTo: source.attachedTo,
  })
}

// Put a deleted note back exactly as it was — same id, same timestamps, so
// wiki-links and backlinks pointing at it resolve again. This is what the
// "Undo" on the delete toast calls; `createNote` can't be used because it mints
// a new id, which would silently orphan every link to the note.
export function restoreNote(note) {
  const clean = normalizeNote(note)
  if (!clean?.id) return null
  // Bump `updatedAt` past the tombstone the delete just wrote. Restoring with
  // the original timestamp leaves the note older than its own deletion, and the
  // next sync — reading a tombstone newer than the local copy — deletes it
  // again on the device that just undid the delete.
  const revived = { ...clean, updatedAt: Date.now(), syncedAt: undefined }
  const ok = writeStore({ ...readStore(), [revived.id]: revived })
  if (ok) {
    clearTombstone(revived.id)
    remoteUpsert(revived) // noteToRow sets deleted_at: null, reviving the row
  }
  return ok ? revived : null
}

// `versionReason` records why the note went, for the history entry taken below.
// A replace-import passes 'pre-import' so the list says what actually happened.
//
// `snapshot` overrides which body gets archived. Normally the note is still in
// the store and reading it here is right — but importNotes({mode:'replace'})
// has already written the replacement store by the time it retires what it
// dropped, so those notes are gone from `readStore()` and would be archived as
// nothing at all. A snapshot of an empty note is worse than none: it looks like
// a working safety net.
export function deleteNote(id, { versionReason = 'pre-delete', snapshot } = {}) {
  const store = readStore()
  const doomed = snapshot || store[id]
  // Don't mutate the object readStore() may be caching — clone without `id`.
  const { [id]: _removed, ...rest } = store
  const ok = writeStore(rest)
  if (ok) {
    // Snapshot before it's gone. Deliberately here rather than at the call
    // sites: every delete path — the note page, the dashboard, a replace-import
    // — needs this, and one that forgets is a silent hole in the safety net.
    // Not awaited (deleteNote is synchronous by contract), which is safe
    // because the content is captured into the call, not read from the store.
    if (doomed) saveVersion(doomed, versionReason)
    cancelPendingPush(id)
    // Record the intent *before* attempting the remote call, and let the call
    // clear it on success. Recording only on failure would lose the delete
    // entirely if the tab closed mid-request — the note is gone here and still
    // live on the server, so the next sync pulls it straight back.
    recordTombstone(id)
    remoteDelete(id)
    refreshRestingStatus()
  }
  return ok
}

// ── backup / restore ──────────────────────────────────────────────────────────
// Notes live only in this browser's localStorage, so an explicit export is the
// user's safety net against a cleared cache or a full-storage silent failure.
export function exportAllNotes() {
  return {
    format: 'qcb.notebook.export@1',
    exportedAt: new Date().toISOString(),
    // Strip `syncedAt`: it describes this browser's relationship to the server,
    // and carrying it into another browser would claim a confirmation that
    // browser never received — the note would look clean and never get pushed.
    notes: Object.values(readStore()).map(({ syncedAt: _drop, ...note }) => note),
  }
}

// Import notes from a previously exported bundle. `mode: 'merge'` keeps existing
// notes (new ids for collisions); `mode: 'replace'` swaps the whole store.
// Returns { imported, ok }.
export function importNotes(payload, { mode = 'merge' } = {}) {
  const incoming = Array.isArray(payload) ? payload : payload?.notes
  if (!Array.isArray(incoming)) return { imported: 0, ok: false }

  const clean = incoming.map(normalizeNote).filter(Boolean)
  const before = readStore() // pre-import state, needed to tombstone in replace mode
  const base = mode === 'replace' ? {} : before
  const next = { ...base }
  const importedNotes = []
  for (const note of clean) {
    const id = mode === 'merge' && next[note.id] ? newId('note') : note.id
    // `syncedAt: undefined` marks every imported note as unconfirmed, so the
    // push below is what establishes its watermark. An import that inherited a
    // watermark from the bundle would look already-synced and never upload.
    next[id] = { ...note, id, syncedAt: undefined }
    importedNotes.push(next[id])
  }
  const ok = writeStore(next)
  if (ok) {
    // `replace` drops every local note the bundle didn't carry. Those still
    // have rows on the server, so without a tombstone the next sync adopts them
    // straight back and "replace" quietly behaves like "merge".
    if (mode === 'replace') {
      for (const id of Object.keys(before)) {
        if (!next[id]) deleteNote(id, { versionReason: 'pre-import', snapshot: before[id] })
      }
    }
    for (const note of importedNotes) remoteUpsert(note)
  }
  return { imported: ok ? importedNotes.length : 0, ok }
}

// ── search, folders & tags ───────────────────────────────────────────────────
// Flattening every note's body into a lower-cased search string is the expensive
// part of a search, and the dashboard searches on every keystroke. readStore()
// hands back the same note objects until the store actually changes, so a
// WeakMap keyed on the note lets a whole search session reuse one pass — and
// entries drop out on their own once a note object is replaced.
const _haystacks = new WeakMap()

function noteHaystack(note) {
  const cached = _haystacks.get(note)
  if (cached !== undefined) return cached

  const parts = [note.title, note.folder, ...(note.tags || []), note.attachedTo?.label || '']
  for (const b of note.content || []) {
    if (b.type === 'text') parts.push(b.markdown)
    else if (b.type === 'code') parts.push(b.code, b.framework)
  }
  const hay = parts.join('\n').toLowerCase()
  _haystacks.set(note, hay)
  return hay
}

// Client-side filter: every whitespace-separated term must appear somewhere.
export function searchNotes(notes, query) {
  const q = query.trim().toLowerCase()
  if (!q) return notes
  const terms = q.split(/\s+/)
  return notes.filter((note) => {
    const hay = noteHaystack(note)
    return terms.every((t) => hay.includes(t))
  })
}

export function allTags(notes) {
  const set = new Set()
  for (const note of notes) for (const t of note.tags || []) set.add(t)
  return [...set].sort()
}

export function allFolders(notes) {
  const set = new Set([DEFAULT_FOLDER])
  for (const note of notes) set.add(note.folder || DEFAULT_FOLDER)
  return [...set].sort((a, b) => (a === DEFAULT_FOLDER ? -1 : b === DEFAULT_FOLDER ? 1 : a.localeCompare(b)))
}

// ── recently opened notes ─────────────────────────────────────────────────────
const RECENT_KEY = 'qcb.notebook.recent'
const RECENT_MAX = 8

export function pushRecentNote(id) {
  if (!id) return
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

// Returns recent notes as full note objects, skipping ones since deleted.
export function getRecentNotes(limit = RECENT_MAX) {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    const store = readStore()
    return ids.map((id) => store[id]).filter(Boolean).slice(0, limit)
  } catch {
    return []
  }
}

// ── shared draft from the Compiler ────────────────────────────────────────────
const COMPILER_DRAFT_KEY = 'qcb.compiler.draft'

export function readCompilerDraft() {
  try {
    return JSON.parse(localStorage.getItem(COMPILER_DRAFT_KEY)) || null
  } catch {
    return null
  }
}

export function writeCompilerDraft(draft) {
  try {
    localStorage.setItem(COMPILER_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

// ── backend pull ──────────────────────────────────────────────────────────────
// Write notes the FastAPI backend changed (including ones an agent created or
// appended to) into the local store. Never pushes them back: they came from there.
// A local note wins when it is newer, so a pull cannot undo typing.
export function applyRemoteNotes(remoteNotes) {
  const store = { ...readStore() }
  let changed = 0
  for (const remote of remoteNotes || []) {
    const local = store[remote.id]
    if (remote.deletedAt) {
      if (local && (local.updatedAt || 0) <= remote.updatedAt) { delete store[remote.id]; changed += 1 }
      continue
    }
    if (local && (local.updatedAt || 0) >= remote.updatedAt) continue
    const { deletedAt: _deletedAt, ...fields } = remote
    store[remote.id] = normalizeNote({ ...fields, syncedAt: undefined })
    changed += 1
  }
  if (changed > 0 && writeStore(store)) {
    window.dispatchEvent(new CustomEvent('nb:notes-changed'))
    return changed
  }
  return 0
}

// Remove every note from this device (sign-out on a shared computer, "delete all
// my data"). Local only: the caller decides whether the server copy goes too.
export function clearLocalNotes() {
  writeStore({})
  for (const key of [TOMBSTONE_KEY, 'qcb.notebook.recent', 'qcb.notebook.snapshotDays', 'qcb.notebook.focus']) {
    try { localStorage.removeItem(key) } catch { /* storage blocked */ }
  }
  window.dispatchEvent(new CustomEvent('nb:notes-changed'))
}

// The server refused these notes because it holds a newer version (they were edited
// on another device). The server's version takes the note's place, and this device's
// text is kept as a copy beside it, so neither side's words are lost. Returns how many
// local notes changed.
export function keepBothOnConflict(serverNotes) {
  let copies = 0
  for (const server of serverNotes || []) {
    const local = readStore()[server.id]
    if (!local || server.deletedAt) continue
    if (JSON.stringify(local.content) === JSON.stringify(server.content)) continue
    createNote({
      title: `${local.title}${CONFLICT_SUFFIX}`,
      content: local.content.map((b) => ({ ...b, id: newId('b') })),
      tags: local.tags,
      folder: local.folder,
    })
    copies += 1
  }
  const changed = applyRemoteNotes(serverNotes)
  if (copies > 0) window.dispatchEvent(new CustomEvent('nb:conflict-copies', { detail: { count: copies } }))
  return changed + copies
}
