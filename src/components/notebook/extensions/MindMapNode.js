// A mind map block. The node stores the whole tree as one attribute (`data`);
// the view edits it. Markdown fallback is a nested list, so export, print, search
// and the assistant all see the ideas, not an opaque blob.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MindMapView from '../nodeViews/MindMapView.jsx'
import { defaultMindMap, mindMapToMarkdown, normalizeMindMap } from '../../../lib/notebook/mindmap.js'

// Keys and clicks inside the map (or its toolbar) belong to the map, not the
// document: without this, Enter or Delete would act on the editor selection.
export const captureInside = ({ event }) => Boolean(event.target?.closest?.('[data-capture-events]'))

export const MindMapNode = Node.create({
  name: 'mindMap',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (el) => normalizeMindMap(el.getAttribute('data-map')),
        renderHTML: (attrs) => ({ 'data-map': JSON.stringify(attrs.data || defaultMindMap()) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="mind-map"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'mind-map' })]
  },

  renderMarkdown(node) {
    return mindMapToMarkdown(normalizeMindMap(node.attrs?.data))
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindMapView, { stopEvent: captureInside })
  },
})

export default MindMapNode
