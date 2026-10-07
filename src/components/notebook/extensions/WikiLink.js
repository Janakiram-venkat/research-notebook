// WikiLink — inline `[[Note Title]]` node for the notebook editor.
//
// Renders as a clickable chip. Typing `[[` opens an autocomplete over existing
// notes (see TextBlock, which wires the suggestion + click navigation). Storage
// stays plain Markdown: a link resolved to a note round-trips as `[[id|Label]]`
// so the resolved target survives reload/rename; a bare unresolved link stays
// `[[Label]]` (still supported on read for backward compatibility with older
// notes) and keeps falling back to title matching.

import { Node, mergeAttributes } from '@tiptap/core'

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: '' },
      noteId: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="wiki-link"]',
        getAttrs: (el) => ({
          label: el.getAttribute('data-label') || el.textContent || '',
          noteId: el.getAttribute('data-note-id') || null,
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    // `is-unresolved` is only a hint from the stored form — a link with no id has
    // nothing to point at yet. NoteDocument re-checks against live titles and
    // corrects the class, since a bare `[[Label]]` may well match a note.
    return [
      'a',
      mergeAttributes(
        {
          'data-type': 'wiki-link',
          class: `nb-wiki-link${node.attrs.noteId ? '' : ' is-unresolved'}`,
          href: '#',
        },
        HTMLAttributes,
        { 'data-label': node.attrs.label, 'data-note-id': node.attrs.noteId || '' },
      ),
      node.attrs.label,
    ]
  },

  // Markdown round-trip: `[[id|Label]]` when resolved, `[[Label]]` when not.
  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenize: (src) => {
      const match = src.match(/^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/)
      if (!match) return undefined
      const [raw, first, second] = match
      const hasId = second !== undefined
      return {
        type: 'wikiLink',
        raw,
        noteId: hasId ? first.trim() : null,
        label: (hasId ? second : first).trim(),
      }
    },
  },

  parseMarkdown: (token) => ({
    type: 'wikiLink',
    attrs: { label: token.label, noteId: token.noteId || null },
  }),

  renderMarkdown: (node) => {
    const label = node.attrs?.label || ''
    const noteId = node.attrs?.noteId
    return noteId ? `[[${noteId}|${label}]]` : `[[${label}]]`
  },
})

export default WikiLink
