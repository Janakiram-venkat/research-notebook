// Callout — styled admonition block (`> [!NOTE]`, `> [!WARNING]`, …).
//
// A block node holding inline content, rendered as a card. Round-trips to the
// exact Markdown syntax MarkdownView.jsx already understands, so PDF/print/cards
// stay in sync. The leading `> [!TYPE]` blockquote is intercepted before marked's
// default blockquote tokenizer; non-callout blockquotes fall through untouched.

import { Node, mergeAttributes } from '@tiptap/core'

export { CALLOUT_TYPES } from '../../../lib/notebook/noteUtils.js'

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-callout') || 'note',
        renderHTML: (attrs) => ({ 'data-callout': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'nb-callout' }),
      ['div', { class: 'nb-callout-body' }, 0],
    ]
  },

  addCommands() {
    return {
      setCallout:
        (type = 'note') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { type } }),
    }
  },

  // Markdown round-trip: `> [!TYPE] body`
  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src) => {
      const m = src.match(/^> \[!/m)
      return m ? m.index : undefined
    },
    tokenize: (src) => {
      // grab the contiguous blockquote block
      const match = src.match(/^((?:>[^\n]*(?:\n|$))+)/)
      if (!match) return undefined
      const raw = match[0]
      const lines = raw.split('\n').filter((l) => l.trim().length)
      const first = lines[0].replace(/^>\s?/, '')
      const head = first.match(/^\[!(\w+)\]\s*(.*)$/i)
      if (!head) return undefined // not a callout — let blockquote handle it
      const type = head[1].toLowerCase()
      const body = [head[2], ...lines.slice(1).map((l) => l.replace(/^>\s?/, ''))]
        .filter((l) => l.length)
        .join(' ')
      return { type: 'callout', raw, calloutType: type, text: body }
    },
  },

  parseMarkdown: (token, helpers) => ({
    type: 'callout',
    attrs: { type: token.calloutType || 'note' },
    content: token.text ? helpers.parseInline(helpers.tokenizeInline(token.text)) : [],
  }),

  renderMarkdown: (node, helpers) => {
    const type = (node.attrs?.type || 'note').toUpperCase()
    const body = helpers.renderChildren(node.content || []).trim()
    return `> [!${type}] ${body}`.trimEnd()
  },
})

export default Callout
