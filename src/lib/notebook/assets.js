// Notebook image assets — Supabase Storage, with a base64 fallback.
//
// Images used to be base64 data URIs inside the note body, which meant they sat
// in the single localStorage key holding *every* note (~5 MB for the whole
// notebook) and were re-uploaded to Postgres in full on every sync of that note.
// A handful of screenshots could exhaust the budget for a user's entire
// notebook. Here the bytes go to Storage and only a URL stays in the note.
//
// Two rules shape this module:
//
//   1. The stored form is an ordinary markdown image, `![alt](https://…)`.
//      Nothing about a note's persisted shape changes — export, print, search,
//      sync and backlinks all keep working untouched, and a note written before
//      this existed still renders. That is also why the bucket is public
//      (migration 008 explains the trade-off): a signed URL expires, and the
//      note body is exactly the wrong place to keep something that expires.
//
//   2. Signed out, base64 still works. The notebook is usable without an
//      account and must stay that way, so the data-URI path is a deliberate
//      fallback rather than dead code — it just carries a much smaller cap,
//      because that path really does spend the shared localStorage budget.

import { getSupabase, getUser } from '../auth.js'

export const ASSET_BUCKET = 'notebook-assets'

/** Signed in: the bytes go to Storage, so this can be generous. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Signed out: the bytes go into the shared ~5 MB localStorage budget, base64
 * inflates by ~33%, and it is then stored as UTF-16. Kept at the old limit.
 */
export const MAX_EMBED_BYTES = 1.5 * 1024 * 1024

// Mirrors migration 008's allowed_mime_types. SVG is excluded there because it
// can carry script and a public bucket serves it on direct navigation; keeping
// the list here too means the user is told at pick time rather than by a failed
// upload after they've already chosen the file.
const ALLOWED_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
])

export function isAllowedImageType(type) {
  return ALLOWED_TYPES.has(type)
}

export function allowedTypeLabel() {
  return 'PNG, JPEG, GIF, WebP or AVIF'
}

/** True for an inline base64 image — the form this module exists to replace. */
export function isDataUrl(src) {
  return typeof src === 'string' && src.startsWith('data:')
}

/** True for a URL already living in our bucket. */
export function isAssetUrl(src) {
  return typeof src === 'string' && src.includes(`/storage/v1/object/public/${ASSET_BUCKET}/`)
}

// `{user_id}/{note_id}/{uuid}.{ext}` — see migration 008. The uid prefix is what
// the storage policies check, the uuid is what makes the URL unguessable, and
// the note id is what a future purge pass will delete by.
function assetPath(userId, noteId, ext) {
  const uuid = crypto.randomUUID()
  return `${userId}/${noteId || 'unfiled'}/${uuid}.${ext}`
}

/**
 * Upload one image and return its permanent public URL.
 *
 * Throws on failure rather than swallowing: the caller has to know, because the
 * fallback (embed as base64) is a real alternative and silently doing nothing
 * would drop the user's image on the floor.
 */
export async function uploadImage(file, noteId) {
  const userId = getUser()?.id
  if (!userId) throw new Error('Not signed in')

  const ext = ALLOWED_TYPES.get(file.type)
  if (!ext) throw new Error(`Unsupported image type: ${file.type || 'unknown'}`)
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is larger than the 10 MB limit')

  const path = assetPath(userId, noteId, ext)
  const { error } = await (await getSupabase()).storage.from(ASSET_BUCKET).upload(path, file, {
    contentType: file.type,
    // Paths carry a fresh uuid, so a collision would be a bug, not a re-save.
    // Letting it overwrite would hide that.
    upsert: false,
  })
  if (error) throw error

  const { data } = (await getSupabase()).storage.from(ASSET_BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('Upload succeeded but no public URL was returned')
  return { url: data.publicUrl, path }
}

// Decode a `data:` URI into a Blob so it can be uploaded like a picked file.
// atob throws on malformed input; callers treat that as "leave it alone".
function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Not a data URL')
  const [, type, isBase64, payload] = match

  if (!isBase64) return new Blob([decodeURIComponent(payload)], { type })

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

// Markdown image with a data: URI. Base64 payloads never contain ')', so the
// lazy-free character class is safe and much faster than backtracking.
const DATA_IMAGE_RE = /!\[([^\]]*)\]\((data:[^)]+)\)/g

/** How many embedded base64 images a note still carries. */
export function countEmbeddedImages(note) {
  let total = 0
  for (const block of note?.content || []) {
    if (block.type !== 'text' || !block.markdown) continue
    total += (block.markdown.match(DATA_IMAGE_RE) || []).length
  }
  return total
}

/**
 * Rewrite one note's embedded base64 images to uploaded URLs.
 *
 * Returns `{ changed, content, uploaded, failed }`. `changed: false` means the
 * caller must not write — rewriting nothing but bumping `updatedAt` would push
 * the note to every other device for no reason.
 *
 * Each image is handled independently and a failure leaves that one image as a
 * data URI. Partial progress is the point: an image that cannot be uploaded
 * today must not block the twelve that can, and the note stays readable either
 * way. The next pass retries whatever is left.
 */
export async function migrateNoteImages(note) {
  const content = note?.content || []
  let uploaded = 0
  let failed = 0

  const nextContent = await Promise.all(
    content.map(async (block) => {
      if (block.type !== 'text' || !block.markdown) return block

      const matches = [...block.markdown.matchAll(DATA_IMAGE_RE)]
      if (matches.length === 0) return block

      let markdown = block.markdown
      for (const [full, alt, dataUrl] of matches) {
        try {
          const blob = dataUrlToBlob(dataUrl)
          if (!isAllowedImageType(blob.type)) {
            failed += 1
            continue
          }
          const { url } = await uploadImage(blob, note.id)
          markdown = markdown.replace(full, `![${alt}](${url})`)
          uploaded += 1
        } catch {
          // Leave this image embedded and move on — see the note above.
          failed += 1
        }
      }
      return markdown === block.markdown ? block : { ...block, markdown }
    }),
  )

  return { changed: uploaded > 0, content: nextContent, uploaded, failed }
}

/**
 * Delete every asset belonging to a note.
 *
 * NOT wired up yet, and that is deliberate — see the closing comment in
 * migration 008. A note delete is a tombstone so it can be undone from the
 * toast or restored on another device, and an undo that returns with every
 * image broken is worse than an orphaned file. This belongs in the hard-purge
 * pass that retires tombstones past their retention window (phase 3), which is
 * the first moment a note is genuinely unrecoverable.
 */
export async function deleteNoteAssets(noteId) {
  const userId = getUser()?.id
  if (!userId || !noteId) return { deleted: 0 }

  const prefix = `${userId}/${noteId}`
  const { data, error } = await (await getSupabase()).storage.from(ASSET_BUCKET).list(prefix)
  if (error || !data?.length) return { deleted: 0 }

  const paths = data.map((entry) => `${prefix}/${entry.name}`)
  const { error: removeError } = await (await getSupabase()).storage.from(ASSET_BUCKET).remove(paths)
  if (removeError) return { deleted: 0 }
  return { deleted: paths.length }
}
