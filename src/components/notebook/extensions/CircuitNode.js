// CircuitNode — an atom block node embedding a saved circuit snapshot inside the
// single-document note editor. Attributes hold the portable qcircuit.json@1 form
// and live only in the ProseMirror JSON; the stored block-array keeps a separate
// `circuit` block (see docBlocks.js). renderMarkdown reuses circuitBlockToMarkdown
// (noteUtils.js) — the same helper NotebookNote.jsx's export uses — as a whole-doc
// safety net, so the two serializations can't diverge.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import CircuitNodeView from '../nodeViews/CircuitNodeView.jsx'
import { circuitBlockToMarkdown } from '../../../lib/notebook/noteUtils.js'

export const CircuitNode = Node.create({
  name: 'circuitNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      format: { default: 'qcircuit.json@1', rendered: false },
      data: { default: null, rendered: false },
      source: { default: 'manual', rendered: false },
      name: { default: '', rendered: false },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="circuit-node"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'circuit-node' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CircuitNodeView)
  },

  renderMarkdown: (node) => circuitBlockToMarkdown({ name: node.attrs?.name, data: node.attrs?.data }),
})

export default CircuitNode
