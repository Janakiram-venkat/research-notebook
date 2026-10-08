// A diagram block: Mermaid source (flowcharts, sequence, timelines, Gantt, class,
// state, ER, pie, quadrant…) rendered as SVG. Mermaid is loaded only when a note
// actually contains a diagram, so it costs nothing to notes without one.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import DiagramView from '../nodeViews/DiagramView.jsx'
import { captureInside } from './MindMapNode.js'

export const DEFAULT_DIAGRAM = `flowchart LR
  A[Question] --> B{Enough data?}
  B -- yes --> C[Analyse]
  B -- no --> D[Collect more]
  D --> B
  C --> E[Write up]`

export const DiagramNode = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: DEFAULT_DIAGRAM,
        parseHTML: (el) => el.getAttribute('data-code') || '',
        renderHTML: (attrs) => ({ 'data-code': attrs.code || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="diagram"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram' })]
  },

  renderMarkdown(node) {
    return '```mermaid\n' + (node.attrs?.code || '') + '\n```'
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView, { stopEvent: captureInside })
  },
})

export default DiagramNode
