// Small pure helpers shared across notebook navigation/organization features.

// ── callouts ──────────────────────────────────────────────────────────────────
// The single source of truth for admonition types, shared by the editor node
// (extensions/Callout.js) and the markdown renderer used for print/PDF
// (MarkdownView.jsx) — they used to keep separate lists, and `info` rendered as
// a plain blockquote on export because only one of them knew about it.
export const CALLOUT_TYPES = ['note', 'tip', 'warning', 'info', 'question', 'example', 'formula']

// ── wiki links ────────────────────────────────────────────────────────────────
// A wiki link is stored as `[[id|Label]]` once resolved to a note, and
// `[[Label]]` while unresolved (see extensions/WikiLink.js). Every reader of
// stored markdown goes through these two helpers so the outline, backlinks and
// the print renderer can't drift apart from the editor's serializer again.
const WIKI_LINK_SOURCE = '\\[\\[([^\\]\\n|]+)(?:\\|([^\\]\\n]+))?\\]\\]'

export function wikiLinkRegex(flags = '') {
  return new RegExp(WIKI_LINK_SOURCE, flags)
}

// Takes the two capture groups of `wikiLinkRegex` and returns the link's parts.
// `[[id|Label]]` → { noteId: 'id', label: 'Label' }; `[[Label]]` → { noteId: null, label }.
export function wikiLinkParts(first, second) {
  const hasId = second !== undefined && second !== null
  return {
    noteId: hasId ? String(first).trim() : null,
    label: String(hasId ? second : first).trim(),
  }
}

// Headings across all text blocks → a flat outline. Each entry knows which
// block it lives in so the UI can scroll to it.
export function extractOutline(note) {
  const out = []
  for (const block of note?.content || []) {
    if (block.type !== 'text' || !block.markdown) continue
    for (const rawLine of block.markdown.split('\n')) {
      const m = rawLine.match(/^(#{1,3})\s+(.+)$/)
      if (!m) continue
      const text = m[2]
        .replace(/[*_`~]/g, '')
        // Show the link's label, never the `id|` prefix a resolved link carries.
        .replace(wikiLinkRegex('g'), (_, first, second) => wikiLinkParts(first, second).label)
        .replace(/\$[^$]+\$/g, '')
        .trim()
      if (text) out.push({ level: m[1].length, text, blockId: block.id })
    }
  }
  return out
}

// Every wiki link a note points at, split by how it was stored: `ids` for links
// resolved to a note (stable across renames), `labels` for unresolved ones
// (lower-cased, matched against titles).
export function outgoingLinks(note) {
  const ids = new Set()
  const labels = new Set()
  for (const block of note?.content || []) {
    if (block.type !== 'text' || !block.markdown) continue
    for (const m of block.markdown.matchAll(wikiLinkRegex('g'))) {
      const { noteId, label } = wikiLinkParts(m[1], m[2])
      if (noteId) ids.add(noteId)
      else if (label) labels.add(label.toLowerCase())
    }
  }
  return { ids, labels }
}

// Notes that link *to* `target`. A resolved link matches on the stored note id,
// so a backlink survives renaming the target; an unresolved `[[Label]]` still
// falls back to title matching. Returns { id, title, folder } sorted by recency.
export function findBacklinks(target, allNotes) {
  if (!target?.id) return []
  const title = (target.title || '').trim().toLowerCase()
  return (allNotes || [])
    .filter((n) => {
      if (n.id === target.id) return false
      const { ids, labels } = outgoingLinks(n)
      return ids.has(target.id) || (Boolean(title) && labels.has(title))
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((n) => ({ id: n.id, title: n.title || 'Untitled note', folder: n.folder }))
}

// Deterministic tag colour: same tag → same hue, every session. Only sets the
// hue as a custom property — notebook.css fixes the lightness and alpha, so a
// tag lands somewhere legible whatever hue it hashes to.
export function tagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i += 1) hash = (hash * 31 + tag.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return { '--tag-hue': hue }
}
