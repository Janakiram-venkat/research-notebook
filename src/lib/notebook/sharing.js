// Share links for lab reports.
//
// Publishing copies the *report projection* into `notebook_shares` (migration
// 011) under an unguessable slug. The copy is the design: a live view would
// keep changing under whoever you sent the link to, and would need read access
// to the owner-locked notes table.
//
// This depends on phase 2. Before images moved to Storage they were base64 data
// URIs inside the note body, so every share row would have carried megabytes of
// blob and the shared page would have been unrenderable for a viewer with no
// session. Prose images are public URLs now and just work for anonymous readers.

import { getSupabase, getUser } from '../auth.js'
import { buildReport } from './report.js'

const TABLE = 'notebook_shares'

/**
 * Refuse to publish beyond this. Execution plots are base64 PNGs stored on the
 * note (they're generated output, never covered by the phase-2 upload path), so
 * a report with a dozen figures can get genuinely large. Postgres would take
 * it, but a viewer on a phone would sit on a blank page — better to say no with
 * a reason than to publish something that doesn't load.
 */
export const MAX_SHARE_BYTES = 2 * 1024 * 1024

// URL-safe, no lookalike characters (no 0/O, 1/l/I) — these get read aloud and
// retyped. 22 chars from a 32-symbol alphabet is ~110 bits.
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function newSlug(length = 22) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length]
  return out
}

/** The absolute URL a viewer opens. */
export function shareUrl(slug) {
  if (typeof window === 'undefined') return `/notebook/shared/${slug}`
  return `${window.location.origin}/notebook/shared/${slug}`
}

/**
 * Whether this note already has a share link.
 *
 * Returns `{ slug, updatedAt } | null`. Errors resolve to null and warn: an
 * unreachable lookup should leave the menu offering "Share", not break the note.
 */
export async function getShare(noteId) {
  const userId = getUser()?.id
  if (!userId || !noteId) return null
  try {
    const { data, error } = await (await getSupabase())
      .from(TABLE)
      .select('slug, updated_at')
      .eq('user_id', userId)
      .eq('note_id', noteId)
      .maybeSingle()
    if (error) throw error
    return data ? { slug: data.slug, updatedAt: new Date(data.updated_at).getTime() } : null
  } catch (err) {
    console.warn('[notebook] could not check share status:', err?.message)
    return null
  }
}

/**
 * Publish (or re-publish) a note's report.
 *
 * Returns `{ slug, url }` on success and throws with a readable message on
 * failure — the opposite of most of this module, and deliberately so: this is
 * lib/savedCode.js's rule rather than lib/progress.js's. Someone who believes
 * they have shared a report will send the link to other people; a publish that
 * quietly did nothing is a promise broken in front of an audience.
 *
 * Pass the existing slug to update in place, so a link already sent to someone
 * keeps working.
 */
export async function publishShare(note, existingSlug = null) {
  const userId = getUser()?.id
  if (!userId) throw new Error('Sign in to share a report')
  if (!note?.id) throw new Error('Nothing to share')

  const report = buildReport(note)
  const payload = JSON.stringify(report)
  if (payload.length > MAX_SHARE_BYTES) {
    throw new Error(
      'This report is too large to share, it is mostly embedded plot images. Remove a few run outputs and try again.',
    )
  }

  const slug = existingSlug || newSlug()
  const row = {
    slug,
    note_id: note.id,
    user_id: userId,
    title: note.title || 'Untitled note',
    report,
    updated_at: new Date().toISOString(),
  }

  const { error } = await (await getSupabase()).from(TABLE).upsert(row)
  if (error) throw new Error(error.message || 'Could not publish the share link')

  return { slug, url: shareUrl(slug) }
}

/** Revoke a share. The link 404s immediately afterwards. */
export async function revokeShare(slug) {
  const userId = getUser()?.id
  if (!userId || !slug) return
  // Throws for the same reason publishShare does: someone revoking a link
  // believes it is now dead, and being wrong about that is the whole risk.
  const { error } = await (await getSupabase()).from(TABLE).delete().eq('user_id', userId).eq('slug', slug)
  if (error) throw new Error(error.message || 'Could not revoke the share link')
}

/**
 * Fetch a shared report by slug, as an anonymous viewer.
 *
 * Returns `{ report, title, updatedAt } | null`. No session required — the
 * select policy in migration 011 is public, which is what makes a share link a
 * share link.
 */
export async function fetchShared(slug) {
  if (!slug) return null
  try {
    const { data, error } = await (await getSupabase())
      .from(TABLE)
      .select('title, report, updated_at')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      title: data.title,
      report: data.report,
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : null,
    }
  } catch (err) {
    console.warn('[notebook] could not load shared report:', err?.message)
    return null
  }
}
