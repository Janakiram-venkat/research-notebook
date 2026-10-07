// RunnableCode — an atom block node holding editable, executable quantum code
// inside the single-document note editor. Its attributes (framework, code, and
// the last run result) live only in the ProseMirror JSON; the note's stored
// block-array keeps a separate `code` block for each of these (see docBlocks.js),
// so the markdown manager never has to serialize a runnable node during a normal
// save. renderMarkdown is provided only as a safety net for whole-doc exports.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import RunnableCodeView from '../nodeViews/RunnableCodeView.jsx'

export const RunnableCode = Node.create({
  name: 'runnableCode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    // rendered:false keeps large/structured attrs (code, run result) out of the
    // DOM — storage is JSON via getJSON(), not serialized HTML.
    return {
      framework: { default: 'qiskit', rendered: false },
      code: { default: '', rendered: false },
      lastResult: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="runnable-code"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'runnable-code' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RunnableCodeView)
  },

  renderMarkdown: (node) => {
    const fw = node.attrs?.framework || 'python'
    return '```' + fw + '\n' + (node.attrs?.code || '') + '\n```'
  },
})

export default RunnableCode
