// Retiring tombstones, and the asset cleanup that rides along with it.
//
// Deleting a note writes a tombstone rather than removing the row (migration
// 007), so the delete can propagate to other devices and be undone from the
// toast. That left two things behind on purpose:
//
//   - the tombstone row itself, forever;
//   - the note's images in Storage, because an undo that comes back with every
//     image broken is worse than an orphaned file (migration 008).
//
// Both are correct while the note is still recoverable, and both become litter
// once it isn't. This pass is that boundary: past the retention window a note
// can no longer be restored by any device, so its row, its images and its
// version history all go together.
//
// There is no cron in this project, so it runs client-side, throttled to once
// per browser per day. That is enough — the window is 30 days and nothing here
// is urgent.

import { getSupabase, getUser } from '../auth.js'
import { deleteNoteAssets } from './assets.js'
import { deleteVersionsFor } from './versions.js'

const REMOTE_TABLE = 'notebook_notes'
const LAST_PURGE_KEY = 'qcb.notebook.lastPurge'

/**
 * How long a deleted note stays recoverable.
 *
 * Long enough that a device offline for a few weeks still learns about the
 * delete before the tombstone disappears — if the row vanished first, that
 * device would see a local note the server has never heard of and re-upload it,
 * which is exactly the resurrection bug tombstones were added to fix.
 */
export const TOMBSTONE_RETENTION_DAYS = 30

// One pass per UTC day per browser. UTC to match the rest of the notebook's
// day handling (see CLAUDE.md on the dashboard calendar).
function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function alreadyRanToday() {
  try {
    return localStorage.getItem(LAST_PURGE_KEY) === todayUtc()
  } catch {
    return false
  }
}

function markRanToday() {
  try {
    localStorage.setItem(LAST_PURGE_KEY, todayUtc())
  } catch {
    /* a disabled localStorage just means it runs again next load */
  }
}

/**
 * Delete tombstones past the retention window, with their assets and versions.
 *
 * Returns `{ ran, purged, assetsDeleted }`. Never throws — this is unprompted
 * background housekeeping and an unhandled rejection on page load would be a
 * bad trade for it.
 *
 * Pass `{ force: true }` to skip the once-a-day throttle (tests, and a future
 * "clean up now" action).
 */
export async function purgeExpiredTombstones({ force = false } = {}) {
  const idle = { ran: false, purged: 0, assetsDeleted: 0 }

  const userId = getUser()?.id
  if (!userId) return idle
  if (!force && alreadyRanToday()) return idle

  const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await (await getSupabase())
      .from(REMOTE_TABLE)
      .select('id')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff)
    if (error) throw error

    const expired = data || []
    // Mark only once the query succeeded. Marking earlier would let a single
    // failed request cost a whole day.
    markRanToday()
    if (expired.length === 0) return idle

    let assetsDeleted = 0
    let purged = 0

    for (const { id } of expired) {
      // Assets and versions first. If the row goes and then this fails, nothing
      // remembers the id and the files are orphaned with no way to find them
      // again; this order can only ever leave a retryable tombstone behind.
      const { deleted } = await deleteNoteAssets(id)
      assetsDeleted += deleted
      await deleteVersionsFor(id)

      const { error: rowError } = await (await getSupabase())
        .from(REMOTE_TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('id', id)
      if (!rowError) purged += 1
    }

    return { ran: purged > 0, purged, assetsDeleted }
  } catch (err) {
    console.warn('[notebook] tombstone purge failed:', err?.message)
    return idle
  }
}
