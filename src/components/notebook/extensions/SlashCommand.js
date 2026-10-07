// Slash command extension: type `/` to open a searchable, keyboard-navigable
// block menu. Item definitions come from slashItems.js (configured per-editor
// with the outer-block + image callbacks); rendering is the shared React bridge.

import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import SuggestionList from '../SuggestionList.jsx'
import { buildSlashItems, filterSlashItems } from './slashItems.js'
import { createSuggestionRender } from './suggestionRender.js'

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      onPickImage: null,
      onInsertEquation: null,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    const items = buildSlashItems({
      onPickImage: () => options.onPickImage?.(),
      onInsertEquation: () => options.onInsertEquation?.(),
    })

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        // Only open the block menu when `/` starts a word. Without this it fired
        // inside `and/or`, `1/2` and every URL the user typed.
        allow: ({ state, range }) => {
          const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, '￼', '￼')
          return before === '' || /\s|￼/.test(before)
        },
        command: ({ editor, range, props }) => props.run({ editor, range }),
        items: ({ query }) => filterSlashItems(items, query).slice(0, 12),
        render: createSuggestionRender(SuggestionList),
      }),
    ]
  },
})

export default SlashCommand
