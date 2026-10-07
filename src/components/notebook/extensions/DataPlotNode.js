// A small data plot for the notebook.
//
// The reader pastes rows of `x, y` (or a single column of `y`) into a
// textarea and picks a chart type; the block renders an inline SVG plot
// beside the data. No chart library is loaded for it: line, bar and
// scatter drawn from scratch fit inside 250 lines and cost nothing at
// startup. A heavier chart offering (log axes, secondary series, error
// bars) is the natural follow-up and would swap the render function
// here for a real library, keeping the storage shape.
//
// Storage: { data (raw text), kind ('line' | 'bar' | 'scatter'),
//            title, xLabel, yLabel }. Markdown export writes the raw data
// back as a fenced ```csv block, so the round-trip through export/import
// keeps everything a reader would type.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import DataPlotView from '../nodeViews/DataPlotView.jsx'

export const DataPlotNode = Node.create({
  name: 'dataPlot',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      data: { default: '' },
      kind: { default: 'line' },
      title: { default: '' },
      xLabel: { default: '' },
      yLabel: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="data-plot"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'data-plot' })]
  },

  renderMarkdown(node) {
    const a = node.attrs || {}
    const meta = []
    if (a.title) meta.push(`title: ${a.title}`)
    if (a.kind) meta.push(`kind: ${a.kind}`)
    if (a.xLabel) meta.push(`xLabel: ${a.xLabel}`)
    if (a.yLabel) meta.push(`yLabel: ${a.yLabel}`)
    const header = meta.length ? `# ${meta.join(' | ')}\n` : ''
    return '```csv\n' + header + (a.data || '') + '\n```'
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataPlotView)
  },
})

export default DataPlotNode
