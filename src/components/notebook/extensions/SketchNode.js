// A freehand sketch block for the notebook.
//
// The node stores one attribute: a data URL of a PNG. Rendering it is just an
// <img>; editing it opens an inline canvas with pen, eraser and clear. Nothing
// heavier is warranted for annotations, diagrams and margin doodles the
// notebook is actually asked for.
//
// Why not tldraw / excalidraw: both are excellent, both add 200+ kB to the
// eager notebook bundle and drag in their own font, and neither reads plain
// PNG back out for print or share. A canvas-in-a-node round-trips through
// storage and print as a single image, which is what the notebook already
// does with pasted photos.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import SketchView from '../nodeViews/SketchView.jsx'

// Markdown fallback: an embedded PNG. Round-trips through export + import
// as a base64 image, which is exactly what a saved sketch already is.
export const SketchNode = Node.create({
  name: 'sketch',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="sketch"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'sketch' }),
      ['img', { src: HTMLAttributes.src || '', alt: 'Freehand sketch' }],
    ]
  },

  renderMarkdown(node) {
    const src = node.attrs?.src || ''
    if (!src) return ''
    return `![Sketch](${src})`
  },

  addNodeView() {
    return ReactNodeViewRenderer(SketchView)
  },
})

export default SketchNode
