// Note version history.
//
// Autosave is good until it isn't: a bad paste, an accidental select-all, or a
// conflict resolution can replace a note's content in one keystroke, and until
// now nothing kept the previous state. `restoreNote` existed but only served
// the delete toast's undo.
//
// Server-side only, and signed-in only. Versions are NOT mirrored into
// localStorage — the notebook already shares one ~5 MB browser budget across
// every note, and twenty historical copies of each would recreate the problem
// phase 2 just solved. Signed out, the safety net stays the JSON export. That
// is the same line sync already draws.
//
// Snapshots are taken at four moments, and the reason is stored with each,
// because "restore this" is a very different decision depending on whether the
// snapshot is a routine checkpoint or the state right before a delete:
//
//   daily        — first time the note is OPENED on a given UTC day. Deliberately
//                  on open rather than on save: it captures the note as it was
//                  before today's editing, which is the state someone reaching
//                  for history actually wants back.
//   manual       — the user asked, via "Save a version".
//   pre-restore  — taken of the CURRENT content before a restore overwrites it,
//                  so restoring is itself undoable.
//   pre-delete   — the note is about to go. Outlives the note on purpose.
//   pre-import   — a replace-import is about to drop this note.

import { getSupabase, getUser } from '../auth.js'

const TABLE = 'notebook_note_versions'
const SNAPSHOT_DAYS_KEY = 'qcb.notebook.snapshotDays'

/** Kept in sync with the trim trigger in migration 009. */
export const MAX_VERSIONS_PER_NOTE = 20

export const VERSION_REASONS = {
  daily: 'Daily checkpoint',
  manual: 'Saved by you',
  'pre-restore': 'Before a restore',
  'pre-delete': 'Before deleting',
  'pre-conflict': 'Before a sync conflict',
  'pre-import': 'Before an import',
}

export function describeReason(reason) {
  return VERSION_REASONS[reason] || 'Snapshot'
}

// ── daily bookkeeping (local) ───────────────────────────────────────────────
// Which notes have been snapshotted today, tracked per browser. Being local
// means a second device may take a second snapshot of the same note on the same
// day — which is the harmless direction to be wrong in. The alternative, a
// SELECT before every open to check, would put a network round-trip in front of
// opening a note.
//
// UTC on both sides, matching the dashboard calendar's rule (see CLAUDE.md):
// a local-time day boundary would move the checkpoint for anyone editing in the
// evening, and disagree between devices in different timezones.
function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function readSnapshotDays() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_DAYS_KEY)) || {}
  } catch {
    return {}
  }
}

function markSnapshotted(noteId, day) {
  try {
    const map = readSnapshotDays()
    map[noteId] = day
    // Yesterday's entries are dead weight; a notebook opened daily for a year
    // would otherwise accumulate an entry per note forever.
    for (const [id, d] of Object.entries(map)) if (d !== day) delete map[id]
    localStorage.setItem(SNAPSHOT_DAYS_KEY, JSON.stringify(map))
  } catch {
    /* a full or disabled localStorage costs an extra snapshot, nothing more */
  }
}

// ── writes ──────────────────────────────────────────────────────────────────

/**
 * Store one version of `note`.
 *
 * Returns true if it landed. Never throws: every caller is on a path the user
 * cares about far more than the snapshot — opening, deleting, restoring — and
 * none of them should fail because history could not be written. A failure is
 * warned, matching lib/progress.js's rule that a silent fallback is
 * indistinguishable from working.
 */
export async function saveVersion(note, reason = 'manual') {
  const userId = getUser()?.id
  if (!userId || !note?.id) return false

  try {
    const { error } = await (await getSupabase()).from(TABLE).insert({
      note_id: note.id,
      user_id: userId,
      title: note.title || 'Untitled note',
      content: note.content || [],
      reason,
    })
    if (error) throw error
    return true
  } catch (err) {
    console.warn('[notebook] could not save a version:', err?.message)
    return false
  }
}

/**
 * Take the day's first snapshot of a note, if it hasn't been taken yet.
 *
 * Call this when a note is opened, before the user can edit it. Returns true
 * only when a snapshot was actually written.
 */
export async function maybeSaveDailyVersion(note) {
  if (!getUser()?.id || !note?.id) return false

  const day = todayUtc()
  if (readSnapshotDays()[note.id] === day) return false

  // Mark first. If two tabs open the same note at once, the loser of the race
  // should skip rather than write a duplicate; marking after the await would
  // let both through.
  markSnapshotted(note.id, day)

  const saved = await saveVersion(note, 'daily')
  // A failed write shouldn't burn the day — clear the mark so the next open
  // tries again, otherwise one flaky moment costs the whole day's checkpoint.
  if (!saved) {
    try {
      const map = readSnapshotDays()
      delete map[note.id]
      localStorage.setItem(SNAPSHOT_DAYS_KEY, JSON.stringify(map))
    } catch {
      /* ignore */
    }
  }
  return saved
}

// ── reads ───────────────────────────────────────────────────────────────────

function rowToVersion(row) {
  return {
    id: row.id,
    noteId: row.note_id,
    title: row.title,
    content: Array.isArray(row.content) ? row.content : [],
    reason: row.reason,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

/**
 * Versions for one note, newest first.
 *
 * Returns `{ versions, error }` rather than a bare array. `getQuizScoresDB` is
 * the cautionary tale here (see CLAUDE.md): returning `[]` for both "failed"
 * and "none yet" leaves the UI unable to tell them apart, and a history panel
 * that says "no earlier versions" when the request actually failed is telling
 * the user their safety net is empty when it isn't.
 */
export async function listVersions(noteId) {
  const userId = getUser()?.id
  if (!userId || !noteId) return { versions: [], error: null }

  try {
    const { data, error } = await (await getSupabase())
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('note_id', noteId)
      .order('created_at', { ascending: false })
      .limit(MAX_VERSIONS_PER_NOTE)
    if (error) throw error
    return { versions: (data || []).map(rowToVersion), error: null }
  } catch (err) {
    console.warn('[notebook] could not load version history:', err?.message)
    return { versions: [], error: err?.message || 'Could not load version history' }
  }
}

/** Delete every version of a note. For the hard-purge pass only. */
export async function deleteVersionsFor(noteId) {
  const userId = getUser()?.id
  if (!userId || !noteId) return false
  try {
    const { error } = await (await getSupabase()).from(TABLE).delete().eq('user_id', userId).eq('note_id', noteId)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('[notebook] could not delete versions:', err?.message)
    return false
  }
}
