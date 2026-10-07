// `[[` autocomplete over existing notes. Inserts a wikiLink node (see
// WikiLink.js) resolved to the matched note's id, or a bare label the user can
// still resolve later. Separate from the WikiLink node so the node stays a pure,
// serializable schema piece.

import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { FileText } from 'lucide-react'
import SuggestionList from '../SuggestionList.jsx'
import { createSuggestionRender } from './suggestionRender.js'

export const WikiSuggestion = Extension.create({
  name: 'wikiSuggestion',

  addOptions() {
    return {
      getNotes: () => [], // () => [{ id, title }]
    }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('wikiSuggestion'),
        char: '[[',
        startOfLine: false,
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'wikiLink', attrs: { label: props.label, noteId: props.noteId } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        items: ({ query }) => {
          const q = (query || '').trim().toLowerCase()
          const notes = options.getNotes() || []
          const matched = (q
            ? notes.filter((n) => (n.title || '').toLowerCase().includes(q))
            : notes
          )
            .slice(0, 8)
            .map((n) => ({
              key: n.id,
              title: n.title || 'Untitled note',
              subtitle: 'Link to note',
              Icon: FileText,
              label: n.title || 'Untitled note',
              noteId: n.id,
            }))

          // Always offer creating a bare link to the typed text.
          if (q && !matched.some((m) => m.title.toLowerCase() === q)) {
            matched.push({
              key: '__new__',
              title: `Link "${query.trim()}"`,
              subtitle: 'Unlinked, resolves when a note matches',
              Icon: FileText,
              label: query.trim(),
              noteId: null,
            })
          }
          return matched
        },
        render: createSuggestionRender(SuggestionList),
      }),
    ]
  },
})

export default WikiSuggestion
