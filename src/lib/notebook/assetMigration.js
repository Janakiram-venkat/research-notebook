// Lift already-embedded base64 images out of existing notes and into Storage.
//
// Phase 2 changes where *new* images go. It does nothing on its own for the
// notes a user already has, and those are the ones actually consuming the
// localStorage budget — a notebook that is already near the cap stays near it,
// which is the exact problem the phase exists to solve.
//
// Kept in its own module rather than in assets.js so the layering stays one-way:
// assets.js knows about Storage and nothing about the note store, this knows
// about both. notebookStore.js imports neither, so there is no cycle.

import { listNotes, updateNote, getStorageInfo } from './notebookStore.js'
import { countEmbeddedImages, migrateNoteImages } from './assets.js'
import { getUser } from '../auth.js'

// Uploads per pass. A notebook full of screenshots should not fire off fifty
// requests the moment the dashboard mounts; whatever is left is picked up next
// visit, and the note stays perfectly readable in the meantime.
const MAX_IMAGES_PER_PASS = 25

// One pass at a time per tab. The dashboard and a note page can both mount
// within a few hundred milliseconds of each other, and two concurrent passes
// would upload the same image twice — the second one writing over the first's
// rewrite with a stale note body.
let _running = false

/**
 * Migrate embedded images across the whole notebook.
 *
 * Returns { ran, uploaded, failed, notesTouched, freedBytes }. `ran: false`
 * means there was nothing to do (or no session) — callers should stay silent in
 * that case rather than reporting a no-op to the user.
 *
 * Never throws. This runs unprompted on page load, and a rejected promise there
 * would surface as an unhandled rejection over what is strictly a background
 * housekeeping task.
 */
export async function migrateEmbeddedImages() {
  const idle = { ran: false, uploaded: 0, failed: 0, notesTouched: 0, freedBytes: 0 }

  if (_running) return idle
  // Signed out there is nowhere to upload to, and base64 is the correct
  // storage for that user — not a backlog waiting to be cleared.
  if (!getUser()?.id) return idle

  const pending = listNotes().filter((note) => countEmbeddedImages(note) > 0)
  if (pending.length === 0) return idle

  _running = true
  const before = getStorageInfo().usedBytes
  let uploaded = 0
  let failed = 0
  let notesTouched = 0

  try {
    for (const note of pending) {
      if (uploaded >= MAX_IMAGES_PER_PASS) break

      const result = await migrateNoteImages(note)
      uploaded += result.uploaded
      failed += result.failed

      // `changed` guards the write: rewriting nothing but bumping `updatedAt`
      // would push the note to every other device for no reason, and on a
      // notebook where every image fails that would happen on every load.
      if (!result.changed) continue

      // Re-read rather than patching the snapshot from listNotes(): the user may
      // have typed since this pass started, and writing the stale body back
      // would silently undo those keystrokes.
      const current = listNotes().find((n) => n.id === note.id)
      if (!current) continue // deleted mid-pass

      const merged = mergeMigratedContent(current.content, note.content, result.content)
      if (!merged) continue

      if (updateNote(note.id, { content: merged })) notesTouched += 1
    }
  } catch (err) {
    console.warn('[notebook] image migration stopped early:', err?.message)
  } finally {
    _running = false
  }

  const freedBytes = Math.max(0, before - getStorageInfo().usedBytes)
  return { ran: notesTouched > 0 || uploaded > 0, uploaded, failed, notesTouched, freedBytes }
}

/**
 * Apply the rewritten blocks onto the note's current content.
 *
 * The pass can take seconds, and the user may be editing the whole time. Only
 * blocks whose text is still byte-identical to what we started from are
 * replaced — anything they touched keeps their version, embedded image and all,
 * and the next pass picks it up. Returns null when there is nothing left to
 * apply, so the caller can skip the write entirely.
 */
function mergeMigratedContent(currentContent, originalContent, migratedContent) {
  const originalById = new Map(originalContent.map((b) => [b.id, b]))
  const migratedById = new Map(migratedContent.map((b) => [b.id, b]))

  let applied = 0
  const next = currentContent.map((block) => {
    const original = originalById.get(block.id)
    const migrated = migratedById.get(block.id)
    if (!original || !migrated || migrated === original) return block
    if (block.markdown !== original.markdown) return block // edited mid-pass
    applied += 1
    return { ...block, markdown: migrated.markdown }
  })

  return applied > 0 ? next : null
}
